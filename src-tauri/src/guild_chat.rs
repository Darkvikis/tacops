use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde_json::{json, Value};
use tauri::State;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_native_tls::TlsStream;
use tokio_tungstenite::tungstenite::handshake::client::generate_key;
use tokio_tungstenite::tungstenite::protocol::{Role, WebSocketConfig};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::WebSocketStream;

use crate::loki::{
    connect, environment_config, now_ms, player_event, EnvironmentConfig, INSTALL_ID,
};

// Signed game events (the /game-event/game3 service) carry an anti-tamper MD5 digest that covers
// the universe + game-config version, so those two must be a version the server accepts and must
// match what's embedded in the body. These are the values observed against game3 in captured
// traffic; the multi-config pair below is NOT covered by the digest (only needs to be plausible).
const GAME_EVENT_UNIVERSE_VERSION: &str = "universe_not_needed";
const GAME_EVENT_CONFIG_VERSION: &str = "de0d38b90a5f79c7cb49bcac6c55fc27";
const GAME_MULTI_CONFIG_VERSION: &str = "2dce8a066bb75217447539d728c0e022";
const GAME_BUILTIN_MULTI_CONFIG_VERSION: &str = "f6fcc8b8b7bdad47e16dccb4c19bffce";

// Sessions last ~1 hour server-side; refresh a little early.
const SESSION_TTL: Duration = Duration::from_secs(55 * 60);

// A window read settles once the server's burst has been quiet this long; a connection that never
// delivers anything settles after the longer idle timeout instead. The idle timeout is kept short
// because the frontend probes empty windows to discover each channel's offset and to detect the end
// of history — the server pushes a non-empty window's first event well within this budget.
const WINDOW_QUIET: Duration = Duration::from_millis(1_500);
const WINDOW_IDLE: Duration = Duration::from_secs(4);

// Raidman's unified API replay-upload endpoint (see tacticus-guild-fe env config). No auth needed;
// the raw base64+gzip replay blob is the request body.
const RAIDMAN_UPLOAD_URL: &str =
    "https://7kirvdjwrfibcitmtpgfcj4tei0supic.lambda-url.ap-southeast-2.on.aws/api/replay";

/// The environment variable holding the game-event digest salt. Kept out of source and the repo —
/// set it in `src-tauri/.env` (see `.env.example`), which is loaded at startup.
const SALT_ENV: &str = "TACTICUS_GAME_EVENT_SALT";

fn game_event_salt() -> Result<String, String> {
    std::env::var(SALT_ENV).map_err(|_| {
        format!("{SALT_ENV} is not set — add it to src-tauri/.env (see src-tauri/.env.example)")
    })
}

/// The anti-tamper digest on a signed game event: uppercase MD5 over the salt and the identifying
/// fields (NOT the multi-config or createdOn). `event_data_string` must be the exact serialized
/// bytes that go on the wire, so the server's recomputation matches.
fn sign_game_event(
    salt: &str,
    event_id: &str,
    game_event_type: &str,
    event_data_string: &str,
) -> String {
    let input = format!(
        "{salt}{event_id}{game_event_type}{GAME_EVENT_UNIVERSE_VERSION}{GAME_EVENT_CONFIG_VERSION}{event_data_string}"
    );
    use md5::Digest;
    md5::Md5::digest(input.as_bytes()).iter().map(|b| format!("{b:02X}")).collect()
}

/// Posts a signed game event. `event_data` is serialized once for the digest and the same Value is
/// embedded in the body, so the bytes serde_json puts on the wire are exactly what was hashed.
/// Game events reply with `eventResults` (plural) and success requires eventResultType == SUCCESS.
async fn post_game_event(
    client: &reqwest::Client,
    config: &EnvironmentConfig,
    user_id: &str,
    session_id: &str,
    game_event_type: &str,
    event_data: Value,
) -> Result<Value, String> {
    let event_id = uuid::Uuid::new_v4().to_string();
    let event_data_string = serde_json::to_string(&event_data)
        .map_err(|e| format!("failed to serialize {game_event_type} eventData: {e}"))?;
    let d = sign_game_event(&game_event_salt()?, &event_id, game_event_type, &event_data_string);
    let body = json!({
        "gameEvents": [{
            "metaData": { "rewards": [] },
            "gameEventType": game_event_type,
            "eventData": event_data,
            "eventId": event_id,
            "age": 0,
            "createdOn": now_ms(),
            "universeVersion": GAME_EVENT_UNIVERSE_VERSION,
            "gameConfigVersion": GAME_EVENT_CONFIG_VERSION,
            "multiConfigVersion": GAME_MULTI_CONFIG_VERSION,
            "d": d,
        }],
        "installId": INSTALL_ID,
        "builtInMultiConfigVersion": GAME_BUILTIN_MULTI_CONFIG_VERSION,
    });

    let url = format!("{}/{user_id}/sessionId/{session_id}", config.game_event_base_url);
    // The game3 service is stricter than the player service about looking like a real client;
    // send the same header set the game client (and the raidman CLI) send.
    let res = client
        .post(&url)
        .header("Accept", "*/*")
        .header("Content-Type", "application/json")
        .header("X-Unity-Version", "6000.3.13f1")
        .header("User-Agent", "Tacticus/2348 CFNetwork/3860.600.12 Darwin/25.5.0")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("request to {url} failed: {e}"))?;

    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("failed reading response body from {url}: {e}"))?;
    if !status.is_success() {
        let snippet = &text[..text.len().min(300)];
        return Err(format!("{game_event_type} returned HTTP {status}: {snippet}"));
    }
    let parsed: Value = serde_json::from_str(&text)
        .map_err(|e| format!("failed to parse JSON response from {url}: {e}"))?;
    let result = &parsed["eventResults"][0];
    if result["eventResultType"] != "SUCCESS" {
        return Err(format!("game event {game_event_type} was not successful: {result}"));
    }
    Ok(result["eventResponseData"].clone())
}

/// Caches the session per (environment, userId) so paging through many windows doesn't re-CONNECT
/// on every request.
#[derive(Default)]
pub struct SessionStore(Mutex<HashMap<String, CachedSession>>);

struct CachedSession {
    session_id: String,
    expires_at: Instant,
}

async fn ensure_session(
    store: &SessionStore,
    client: &reqwest::Client,
    config: &EnvironmentConfig,
    environment: &str,
    user_id: &str,
    client_secret: &str,
    snow_id: &str,
    force_refresh: bool,
) -> Result<String, String> {
    let key = format!("{environment}:{user_id}");
    if !force_refresh {
        let guard = store.0.lock().map_err(|_| "session store lock poisoned".to_string())?;
        if let Some(cached) = guard.get(&key) {
            if cached.expires_at > Instant::now() {
                return Ok(cached.session_id.clone());
            }
        }
    }
    let session_id = connect(client, config, user_id, client_secret, snow_id).await?;
    let mut guard = store.0.lock().map_err(|_| "session store lock poisoned".to_string())?;
    guard.insert(
        key,
        CachedSession { session_id: session_id.clone(), expires_at: Instant::now() + SESSION_TTL },
    );
    Ok(session_id)
}

/// Resolves the account's own guild id via GET_PLAYER_INFO.
async fn resolve_guild_id(
    client: &reqwest::Client,
    config: &EnvironmentConfig,
    user_id: &str,
    session_id: &str,
) -> Result<String, String> {
    let response =
        player_event(client, config, user_id, session_id, "GET_PLAYER_INFO", json!({ "requestedUserId": user_id }))
            .await?;
    response["eventResult"]["eventResponseData"]["guildInfo"]["guildId"]
        .as_str()
        .filter(|id| !id.is_empty())
        .map(|id| id.to_string())
        .ok_or_else(|| "this account doesn't appear to be in a guild".to_string())
}

/// Fetches a stored replay by id — the base64-of-gzip battle JSON the game keeps, which is the
/// exact blob Raidman's replay upload accepts.
async fn fetch_replay(
    client: &reqwest::Client,
    config: &EnvironmentConfig,
    user_id: &str,
    session_id: &str,
    replay_id: &str,
) -> Result<String, String> {
    let response =
        player_event(client, config, user_id, session_id, "FETCH_REPLAY", json!({ "replayId": replay_id }))
            .await?;
    response["eventResult"]["eventResponseData"]["replay"]
        .as_str()
        .filter(|replay| !replay.is_empty())
        .map(|replay| replay.to_string())
        .ok_or_else(|| format!("the game returned no replay for {replay_id}"))
}

/// GET_GUILD_STATE (signed) is the only call that reports the newest event id per channel, which is
/// where a scrollback read starts.
async fn get_guild_state(
    client: &reqwest::Client,
    config: &EnvironmentConfig,
    user_id: &str,
    session_id: &str,
    guild_id: &str,
) -> Result<Value, String> {
    post_game_event(
        client,
        config,
        user_id,
        session_id,
        "GET_GUILD_STATE",
        json!({ "guildId": guild_id, "excludeRank": false }),
    )
    .await
}

/// Reads a single window on one channel: opens the realtime socket subscribed at `seq`, collects
/// the burst the server pushes, and returns it once the burst goes quiet. The server answers a seq
/// with one fixed-width window (starting some way above the seq asked for), so this one primitive is
/// all a read needs; the frontend walks `seq` to page further back.
async fn read_window(
    config: &EnvironmentConfig,
    user_id: &str,
    session_id: &str,
    guild_id: &str,
    channel: &str,
    seq: i64,
) -> Result<Vec<Value>, String> {
    let channel_ids = format!("{channel}:{guild_id}");
    let mut stream = open_channel_socket(config, user_id, session_id, &channel_ids, seq).await?;

    let mut events: Vec<Value> = Vec::new();
    loop {
        let wait = if events.is_empty() { WINDOW_IDLE } else { WINDOW_QUIET };
        match tokio::time::timeout(wait, stream.next()).await {
            Err(_) => break,
            Ok(None) => break,
            Ok(Some(Err(error))) => return Err(format!("guild feed websocket error: {error}")),
            Ok(Some(Ok(message))) => {
                if let Some(text) = message_text(&message) {
                    collect_frame_events(&text, channel, &mut events)?;
                }
            }
        }
    }
    let _ = stream.close(None).await;
    Ok(events)
}

/// Opens the channel websocket by driving the HTTP/1.1 upgrade handshake by hand. The subscription
/// headers (userId/sessionId/channelIds/channelSeqs) MUST keep their exact camelCase — the game's
/// socket server reads them case-sensitively, and Rust's `http` HeaderMap would lowercase them, so
/// connect_async can't be used here. The request bytes are written verbatim, the 101 response is
/// consumed, and any bytes the server already pushed after it seed the websocket reader.
async fn open_channel_socket(
    config: &EnvironmentConfig,
    user_id: &str,
    session_id: &str,
    channel_ids: &str,
    seq: i64,
) -> Result<WebSocketStream<TlsStream<TcpStream>>, String> {
    let host = config.websocket_host;
    let tcp = TcpStream::connect((host, 443))
        .await
        .map_err(|e| format!("guild feed TCP connect to {host} failed: {e}"))?;
    let connector = tokio_native_tls::TlsConnector::from(
        native_tls::TlsConnector::new().map_err(|e| format!("TLS setup failed: {e}"))?,
    );
    let mut stream = connector
        .connect(host, tcp)
        .await
        .map_err(|e| format!("guild feed TLS handshake to {host} failed: {e}"))?;

    let request = format!(
        "GET / HTTP/1.1\r\n\
         Host: {host}\r\n\
         Upgrade: websocket\r\n\
         Connection: Upgrade\r\n\
         Sec-WebSocket-Key: {key}\r\n\
         Sec-WebSocket-Version: 13\r\n\
         userId: {user_id}\r\n\
         sessionId: {session_id}\r\n\
         channelIds: {channel_ids}\r\n\
         channelSeqs: {seq}\r\n\
         \r\n",
        key = generate_key(),
    );
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|e| format!("guild feed handshake write failed: {e}"))?;

    let leftover = read_handshake_response(&mut stream).await?;
    Ok(WebSocketStream::from_partially_read(stream, leftover, Role::Client, Some(WebSocketConfig::default())).await)
}

/// Reads the server's HTTP upgrade response up to the blank-line terminator, checks it's a 101, and
/// returns any bytes that arrived after the headers (the server pushes the backlog window straight
/// away, so those bytes are the start of the websocket stream and must not be dropped).
async fn read_handshake_response(
    stream: &mut TlsStream<TcpStream>,
) -> Result<Vec<u8>, String> {
    let mut buffer = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    loop {
        let terminator = find_header_end(&buffer);
        if let Some(end) = terminator {
            let status_line = String::from_utf8_lossy(&buffer[..buffer.iter().position(|&b| b == b'\r').unwrap_or(0)]);
            if !status_line.contains(" 101") {
                return Err(format!("guild feed handshake was rejected: {status_line}"));
            }
            return Ok(buffer[end..].to_vec());
        }
        let read = stream
            .read(&mut chunk)
            .await
            .map_err(|e| format!("guild feed handshake read failed: {e}"))?;
        if read == 0 {
            return Err("guild feed handshake closed before completing".to_string());
        }
        buffer.extend_from_slice(&chunk[..read]);
    }
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n").map(|index| index + 4)
}

fn message_text(message: &Message) -> Option<String> {
    match message {
        Message::Text(text) => Some(text.as_str().to_string()),
        Message::Binary(bytes) => Some(String::from_utf8_lossy(bytes.as_ref()).into_owned()),
        _ => None,
    }
}

/// A frame is `{"events": {channelKey: [event, ...]}}`. We subscribe to one channel per socket, so
/// every event in the frame belongs to it; tag each with the requested channel name for the caller.
fn collect_frame_events(text: &str, channel: &str, out: &mut Vec<Value>) -> Result<(), String> {
    let frame: Value =
        serde_json::from_str(text).map_err(|e| format!("failed to parse guild feed frame: {e}"))?;
    let Some(events_by_channel) = frame.get("events").and_then(|events| events.as_object()) else {
        return Ok(());
    };
    for list in events_by_channel.values() {
        let Some(list) = list.as_array() else { continue };
        for event in list {
            let mut event = event.clone();
            if let Some(object) = event.as_object_mut() {
                object.insert("channel".to_string(), Value::String(channel.to_string()));
            }
            out.push(event);
        }
    }
    Ok(())
}

/// Resolves the guild and reports the newest event id per channel — the seqs a scrollback read
/// starts from. `guild_id` may be omitted to use the account's own guild.
#[tauri::command]
pub async fn guild_feed_init(
    environment: String,
    user_id: String,
    client_secret: String,
    snow_id: String,
    guild_id: Option<String>,
    sessions: State<'_, SessionStore>,
) -> Result<Value, String> {
    let config = environment_config(&environment)?;
    let client = reqwest::Client::new();
    let session_id =
        ensure_session(&sessions, &client, config, &environment, &user_id, &client_secret, &snow_id, false).await?;

    let guild_id = match guild_id {
        Some(id) if !id.is_empty() => id,
        _ => resolve_guild_id(&client, config, &user_id, &session_id).await?,
    };
    let state = get_guild_state(&client, config, &user_id, &session_id, &guild_id).await?;
    let events_state = &state["guildEventsState"];

    Ok(json!({
        "guildId": guild_id,
        "guildName": state["guild"]["name"].as_str(),
        "guildTag": state["guild"]["guildTag"].as_str(),
        "seqs": {
            "guild": events_state["lastGuildEventId"].as_i64(),
            "guildchat": events_state["lastGuildChatEventId"].as_i64(),
        },
    }))
}

/// Reads one window of a channel's events at the given seq. The frontend calls this repeatedly with
/// decreasing seqs to page back through history, deduping and merging as it goes.
#[tauri::command]
pub async fn read_channel_window(
    environment: String,
    user_id: String,
    client_secret: String,
    snow_id: String,
    guild_id: String,
    channel: String,
    seq: i64,
    sessions: State<'_, SessionStore>,
) -> Result<Vec<Value>, String> {
    let config = environment_config(&environment)?;
    let client = reqwest::Client::new();
    let session_id =
        ensure_session(&sessions, &client, config, &environment, &user_id, &client_secret, &snow_id, false).await?;

    match read_window(config, &user_id, &session_id, &guild_id, &channel, seq).await {
        Ok(events) => Ok(events),
        // A socket that fails to open usually means the cached session went stale; reconnect once
        // with a fresh session before giving up.
        Err(_) => {
            let session_id = ensure_session(
                &sessions, &client, config, &environment, &user_id, &client_secret, &snow_id, true,
            )
            .await?;
            read_window(config, &user_id, &session_id, &guild_id, &channel, seq).await
        }
    }
}

/// Fetches a shared replay from the game and re-uploads it to Raidman, unlisted. Returns Raidman's
/// JSON metadata (hash, totalDamage, ...) for the app to display.
#[tauri::command]
pub async fn upload_replay(
    environment: String,
    user_id: String,
    client_secret: String,
    snow_id: String,
    guild_id: String,
    replay_id: String,
    sessions: State<'_, SessionStore>,
) -> Result<Value, String> {
    let config = environment_config(&environment)?;
    let client = reqwest::Client::new();
    let session_id =
        ensure_session(&sessions, &client, config, &environment, &user_id, &client_secret, &snow_id, false).await?;

    let replay = match fetch_replay(&client, config, &user_id, &session_id, &replay_id).await {
        Ok(replay) => replay,
        // A stale cached session fails the fetch; reconnect once and retry before giving up.
        Err(_) => {
            let session_id = ensure_session(
                &sessions, &client, config, &environment, &user_id, &client_secret, &snow_id, true,
            )
            .await?;
            fetch_replay(&client, config, &user_id, &session_id, &replay_id).await?
        }
    };

    upload_to_raidman(&client, &guild_id, replay).await
}

/// Uploads a replay blob to Raidman unlisted — omitting X-Guild-Tag keeps it off any cluster, and
/// the two custom headers tag the upload with its source guild and mark it as coming from tacops.
async fn upload_to_raidman(
    client: &reqwest::Client,
    guild_id: &str,
    replay: String,
) -> Result<Value, String> {
    let res = client
        .post(RAIDMAN_UPLOAD_URL)
        .header("Content-Type", "text/plain")
        .header("X-Guild-Id", guild_id)
        .header("X-Source", "tacops")
        .body(replay)
        .send()
        .await
        .map_err(|e| format!("Raidman upload request failed: {e}"))?;

    let status = res.status();
    let text = res.text().await.map_err(|e| format!("failed reading Raidman response: {e}"))?;
    if !status.is_success() {
        let snippet = &text[..text.len().min(300)];
        return Err(format!("Raidman upload returned HTTP {status}: {snippet}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("failed to parse Raidman response: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Structural check of the digest wiring (salt + fields + universe/config, uppercase MD5) using a
    // dummy salt, so the real salt stays out of source. The real salt lives in src-tauri/.env and is
    // exercised end-to-end by the ignored live test below (a wrong salt fails GET_GUILD_STATE).
    #[test]
    fn signs_a_game_event_with_the_given_salt() {
        let digest = sign_game_event("test-salt", "evt", "TYPE", "{}");
        assert_eq!(digest, "FFEB306F18BC7AC896A8B4568819D2C9");
    }

    #[test]
    fn tags_frame_events_with_their_channel() {
        let mut out = Vec::new();
        collect_frame_events(
            r#"{"events":{"guildchat":[{"type":"GuildChatEvent","seq":5,"content":"hi"}]}}"#,
            "guildchat",
            &mut out,
        )
        .unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0]["channel"], "guildchat");
        assert_eq!(out[0]["seq"], 5);
    }

    // Live end-to-end read against the real game servers using the local prod credentials file.
    // Ignored by default (needs network + a logged-in account); run with:
    //   cargo test --lib -- --ignored --nocapture live_reads_guild_state_and_a_window
    // This is the check that the game-config versions the signed GET_GUILD_STATE carries are still
    // accepted by the live game3 service.
    #[tokio::test]
    #[ignore]
    async fn live_reads_guild_state_and_a_window() {
        dotenvy::dotenv().ok();
        let home = std::env::var("HOME").unwrap();
        let path = format!(
            "{home}/Library/Application Support/com.snowprintstudios.tacticus/live-loki_user_data.json"
        );
        let raw = std::fs::read_to_string(&path).expect("read prod credentials file");
        let creds: Value = serde_json::from_str(&raw).unwrap();
        let user_id = creds["userId"].as_str().expect("userId").to_string();
        let client_secret = creds["clientSecret"].as_str().expect("clientSecret").to_string();
        let snow_id = creds["snowId"].as_str().unwrap_or("").to_string();

        let config = environment_config("prod").unwrap();
        let client = reqwest::Client::new();
        let session_id = connect(&client, config, &user_id, &client_secret, &snow_id).await.unwrap();
        let guild_id = resolve_guild_id(&client, config, &user_id, &session_id).await.unwrap();
        println!("guildId = {guild_id}");

        let state = get_guild_state(&client, config, &user_id, &session_id, &guild_id).await.unwrap();
        let events_state = &state["guildEventsState"];
        let chat_top = events_state["lastGuildChatEventId"].as_i64().expect("lastGuildChatEventId");
        let guild_top = events_state["lastGuildEventId"].as_i64().expect("lastGuildEventId");
        println!("newest seqs: guildchat={chat_top} guild={guild_top}");
        assert!(chat_top > 0 && guild_top > 0);

        // The server answers a seq with a window starting ~1700 above it, so read below the newest
        // seq to land on the newest events (this is what the frontend's descending walk does). The
        // camelCase handshake headers matter here: the socket server reads them case-sensitively.
        let probe = chat_top - 1900;
        let window =
            read_window(config, &user_id, &session_id, &guild_id, "guildchat", probe).await.unwrap();
        let seqs: Vec<i64> = window.iter().filter_map(|e| e["seq"].as_i64()).collect();
        println!(
            "guildchat window at {probe} returned {} events (seq {:?}..{:?})",
            window.len(),
            seqs.iter().min(),
            seqs.iter().max()
        );
        assert!(!window.is_empty(), "expected a window below the offset to contain events");

        // Confirm the guild channel is reachable too, and measure its offset — the "no guild
        // events at start" bug was the guild offset being larger than the guildchat one, so a fixed
        // 1900 guess lands in the empty gap. Mirror the frontend's exponential discovery here.
        // The guild channel is forward-paging: a request at S returns the events just after S up to
        // the top, so a small margin reaches the newest events (a large one caps short of them).
        let guild_probe = guild_top - 250;
        let guild_window =
            read_window(config, &user_id, &session_id, &guild_id, "guild", guild_probe).await.unwrap();
        let guild_seqs: Vec<i64> = guild_window.iter().filter_map(|e| e["seq"].as_i64()).collect();
        println!(
            "guild window at {guild_probe} returned {} events (seq {:?}..{:?})",
            guild_window.len(),
            guild_seqs.iter().min(),
            guild_seqs.iter().max()
        );
        assert_eq!(
            guild_seqs.iter().max().copied(),
            Some(guild_top),
            "a small-margin guild request should reach the newest guild event"
        );
    }
}
