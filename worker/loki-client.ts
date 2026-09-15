// Ported 1:1 from src-tauri/src/loki.rs (and src-tauri/src/crusades.rs) - keep them in sync.
// This is the CORS-workaround proxy the web build needs in place of that Rust code (a browser
// can't call Snowprint directly).
import md5 from "js-md5";

// Confirmed via real Proxyman captures: the actual game client reuses this exact trio unchanged
// across APP_START, CONNECT, and GET_PLAYER in the same session - not re-derived per call. Same
// values on both prod and QA.
const GAME_CONFIG_VERSION = "f92fb06ae9c02542bb3f520fc562f709";
const MULTI_CONFIG_VERSION = "897f8de5439de707acaf6b3add1eeba3";
const INSTALL_ID = "scraper-installid";

interface EnvironmentConfig {
  baseUrl: string;
  // Same host/session as baseUrl's player/player2 tree, but game-event calls (GET_CRUSADE and
  // friends) live under a different path and need their own signed envelope - see below.
  gameEventBaseUrl: string;
  environmentId: string;
  bundleId: string;
  jenkinsBuildBranchInfo: string;
  builtInMultiConfigVersion: string;
}

// The fields below come straight from a real captured QA CONNECT request and differ from prod.
// Device/hardware fingerprint fields (os, model, screen size, graphics, ram, ...) are deliberately
// left as generic scraper values on both environments instead of mirrored from that capture - prod
// already works fine with fully fake device data, so there's no evidence the backend validates them.
const PROD_CONFIG: EnvironmentConfig = {
  baseUrl: "https://api-live.loki.snowprintstudios.com/player/player2/userId",
  gameEventBaseUrl: "https://api-live.loki.snowprintstudios.com/game-event/game3/userId",
  environmentId: "live-loki",
  bundleId: "com.snowprintstudios.tacticus",
  jenkinsBuildBranchInfo: "release",
  builtInMultiConfigVersion: "f34892307c9d4727869adf53f3afa446",
};

// gameEventBaseUrl here is derived by analogy with prod (same api-staging host, same
// player/player2 -> game-event/game3 swap) - unconfirmed by a real QA capture, unlike everything
// else in this file.
const QA_CONFIG: EnvironmentConfig = {
  baseUrl: "https://api-staging.loki.snowprintstudios.com/player/player2/userId",
  gameEventBaseUrl: "https://api-staging.loki.snowprintstudios.com/game-event/game3/userId",
  environmentId: "staging-loki",
  bundleId: "com.snowprintstudios.loki.qa",
  jenkinsBuildBranchInfo: "staging",
  builtInMultiConfigVersion: "34c80d71f65bd74deb6ba74f01d1c725",
};

function environmentConfig(environment: string): EnvironmentConfig {
  if (environment === "prod") return PROD_CONFIG;
  if (environment === "qa") return QA_CONFIG;
  throw new Error(`Unknown environment: ${environment}`);
}

function envelope(playerEventType: string, playerEventData: unknown, config: EnvironmentConfig) {
  return {
    playerEvent: {
      playerEventType,
      playerEventData,
      universeVersion: "universe_not_needed",
      gameConfigVersion: GAME_CONFIG_VERSION,
      createdOn: String(Date.now()),
      multiConfigVersion: MULTI_CONFIG_VERSION,
    },
    builtInMultiConfigVersion: config.builtInMultiConfigVersion,
    installId: INSTALL_ID,
  };
}

async function post(url: string, body: unknown): Promise<any> {
  // Without an explicit timeout, a stalled connection would hang the request forever - matches
  // the 20s reqwest timeout on the Rust side, added after a real hung request froze the whole app.
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  }).catch((e) => {
    throw new Error(`request to ${url} failed: ${e}`);
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${url} returned HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`failed to parse JSON response from ${url}: ${e}`);
  }

  // HTTP 200 doesn't guarantee app-level success - surface eventResult failures explicitly rather
  // than letting a downstream call fail confusingly on missing data.
  if (parsed?.eventResult?.eventResultType !== "SUCCESS") {
    throw new Error(`${url} returned an application error: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

interface Session {
  config: EnvironmentConfig;
  baseUrl: string;
  sessionId: string;
}

// APP_START -> CONNECT, matching the real client's boot sequence (confirmed via Proxyman
// capture). CONNECT exchanges the account's clientSecret/snowId for a sessionId; every call
// after that uses the sessionId-suffixed URL. Shared by every function that needs a session
// (GET_PLAYER, GET_CRUSADE, GET_LEADERBOARD_2, ...) since the sessionId is valid across both the
// player/player2 and game-event/game3 URL trees, not just the one it was minted under.
async function bootstrapSession(environment: string, userId: string, clientSecret: string, snowId: string): Promise<Session> {
  const config = environmentConfig(environment);
  const baseUrl = `${config.baseUrl}/${userId}`;

  const appStartBody = envelope(
    "APP_START",
    {
      appId: "loki",
      apiVersion: "0.1",
      os: "Linux",
      deviceType: "server",
      deviceName: "scraper",
      deviceId: "scraper",
      locale: "en_US",
      userId,
      appVersion: "1.21.46.689",
      universeVersion: "universe_not_needed",
      installId: INSTALL_ID,
      platform: "Linux",
      store: "Server",
      countryCode: "US",
    },
    config,
  );
  await post(baseUrl, appStartBody);

  const connectData: Record<string, unknown> = {
    userId,
    clientSecret,
    deviceData: {
      installId: INSTALL_ID,
      deviceId: "scraper",
      countryCode: "US",
      locale: "en_US",
      manufacturer: "scraper",
      model: "scraper",
      os: "Linux",
      buildString: "1.21.46.689",
      screenWidth: 1920,
      screenHeight: 1080,
      platform: "Linux",
      store: "Server",
      distribution: "Desktop",
      ram: 8192,
      environmentId: config.environmentId,
      jenkinsBuildBranchInfo: config.jenkinsBuildBranchInfo,
      bundleId: config.bundleId,
      graphicsDeviceName: "None",
      graphicsShaderLevel: 0,
      graphicsMemorySize: 0,
      processorType: "scraper",
      supportedTextureFormats: "None",
    },
  };
  // QA's credentials file has no snowId at all, and a real captured QA CONNECT request omits the
  // field entirely rather than sending it empty - match that instead of sending "".
  if (snowId) connectData.snowId = snowId;

  const connectBody = envelope("CONNECT", connectData, config);
  const connectResponse = await post(baseUrl, connectBody);
  const sessionId = connectResponse?.eventResult?.eventResponseData?.userData?.sessionId;
  if (!sessionId) {
    throw new Error("CONNECT response didn't contain a sessionId - is clientSecret/snowId correct?");
  }

  return { config, baseUrl, sessionId };
}

// GET_PLAYER needs no dynamic parameters at all and returns the player's full state (roster,
// resources, progress - including the expeditions board), not anything specific to a particular
// live event.
export async function fetchPlayerDataFromLoki(
  environment: string,
  userId: string,
  clientSecret: string,
  snowId: string,
): Promise<unknown> {
  const { config, baseUrl, sessionId } = await bootstrapSession(environment, userId, clientSecret, snowId);
  const sessionUrl = `${baseUrl}/sessionId/${sessionId}`;
  const getPlayerBody = envelope("GET_PLAYER", { storefrontCountryCode: "NotAvailable" }, config);
  return post(sessionUrl, getPlayerBody);
}

// Reverse-engineered this session from 5 real captures (2 different gameEventTypes) - every
// sample matched exactly. Only these 5 fields feed the hash; createdOn, age,
// multiConfigVersion, installId, and sessionId do not, and can't explain a mismatch. eventData
// must be signed as the exact compact-JSON bytes actually sent - if it's ever mutated after being
// built, re-sign after the mutation, not before.
const GAME_EVENT_SALT = "Sp#!";
const UNIVERSE_VERSION = "universe_not_needed";

// Deliberately NOT GAME_CONFIG_VERSION/MULTI_CONFIG_VERSION above, and not
// config.builtInMultiConfigVersion either. These three travel together as one matched set
// representing the live client's *current* config generation - confirmed by a live capture of a
// totally unrelated playerEvent call (a fresh APP_START) showing the identical trio. The
// constants above are simply from an older generation that CONNECT/GET_PLAYER still tolerate,
// while GET_CRUSADE strictly validates against the current one (a first live GET_CRUSADE call
// using the older MULTI_CONFIG_VERSION/builtInMultiConfigVersion here failed with
// "Could not find gameConfig ... in multiConfig=..."). If this trio ever goes stale again,
// recapture all three together from *any* current live call - they're not something unique to
// game-event calls, just the current generation, whatever call happens to be handy to capture.
const GAME_EVENT_GAME_CONFIG_VERSION = "095fb039d4e0a0b1ff90b8104ca5e393";
const GAME_EVENT_MULTI_CONFIG_VERSION = "abe12f6fd5361f20f5379ae62ecd5882";
// Only confirmed for prod, like EnvironmentConfig.gameEventBaseUrl - unconfirmed for QA.
const GAME_EVENT_BUILT_IN_MULTI_CONFIG_VERSION = "a26f2bc38d9f20a570ca53f608fcf462";

export function gameEventChecksum(eventId: string, gameEventType: string, eventData: unknown): string {
  const eventDataStr = JSON.stringify(eventData);
  const combined = `${GAME_EVENT_SALT}${eventId}${gameEventType}${UNIVERSE_VERSION}${GAME_EVENT_GAME_CONFIG_VERSION}${eventDataStr}`;
  return md5(combined).toUpperCase();
}

// GET_CRUSADE and friends live under a different envelope family than GET_PLAYER/CONNECT - a
// "gameEvents" array (only ever one entry here) instead of a single "playerEvent", each entry
// individually signed with "d". The response mirrors that: "eventResults" (plural, array) instead
// of "eventResult".
function gameEventEnvelope(gameEventType: string, eventData: unknown) {
  const eventId = crypto.randomUUID();
  const d = gameEventChecksum(eventId, gameEventType, eventData);
  return {
    gameEvents: [
      {
        metaData: { rewards: [] },
        gameEventType,
        eventData,
        eventId,
        // Not part of the "d" signature and not validated server-side as far as we've seen - the
        // real client's value here drifts (seemingly a client-local cache-freshness hint), so a
        // fixed placeholder is fine.
        age: 0,
        createdOn: String(Date.now()),
        universeVersion: UNIVERSE_VERSION,
        gameConfigVersion: GAME_EVENT_GAME_CONFIG_VERSION,
        multiConfigVersion: GAME_EVENT_MULTI_CONFIG_VERSION,
        d,
      },
    ],
    installId: INSTALL_ID,
    builtInMultiConfigVersion: GAME_EVENT_BUILT_IN_MULTI_CONFIG_VERSION,
  };
}

async function postGameEvent(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  }).catch((e) => {
    throw new Error(`request to ${url} failed: ${e}`);
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${url} returned HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`failed to parse JSON response from ${url}: ${e}`);
  }

  if (parsed?.eventResults?.[0]?.eventResultType !== "SUCCESS") {
    throw new Error(`${url} returned an application error: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

// GET_CRUSADE returns the current crusade season's phase schedule and per-planet faction
// ownership/points - not anything specific to a single planet.
export async function fetchCrusadeDataFromLoki(
  environment: string,
  userId: string,
  clientSecret: string,
  snowId: string,
): Promise<unknown> {
  const { config, sessionId } = await bootstrapSession(environment, userId, clientSecret, snowId);
  const gameEventUrl = `${config.gameEventBaseUrl}/${userId}/sessionId/${sessionId}`;
  const body = gameEventEnvelope("GET_CRUSADE", {});
  return postGameEvent(gameEventUrl, body);
}

// GET_LEADERBOARD_2 reuses the ordinary playerEvent envelope (no "d" signature needed - only
// game-event/game3 calls are signed) but needs the sessionId in the URL path, not just in the
// body, or the server rejects it with "requires secured communication". leaderboardIds must
// already carry their type prefix (crusadePlayer:/crusadeFaction:/crusadeGuild:) - a
// missing/wrong prefix doesn't error, it silently echoes the id back with no entries.
export async function fetchLeaderboardDataFromLoki(
  environment: string,
  userId: string,
  clientSecret: string,
  snowId: string,
  leaderboardIds: string[],
): Promise<unknown> {
  const { config, baseUrl, sessionId } = await bootstrapSession(environment, userId, clientSecret, snowId);
  const sessionUrl = `${baseUrl}/sessionId/${sessionId}`;
  const leaderboards = leaderboardIds.map((leaderboardId) => ({ leaderboardId, participantId: userId }));
  const body = envelope("GET_LEADERBOARD_2", { leaderboards }, config);
  return post(sessionUrl, body);
}
