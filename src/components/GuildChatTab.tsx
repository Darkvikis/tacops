import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  findCredentials,
  raidmanReplayUrl,
  uploadReplay,
  type ChannelName,
  type ReplayUploadResult,
} from "../api/guild-chat";
import type { Environment } from "../api/types";
import {
  initGuildFeed,
  loadOlderEvents,
  type GuildFeed,
  type LoadProgress,
} from "../guild/guild-feed";
import {
  eventCategory,
  EVENT_CATEGORIES,
  formatEventTime,
  guildEventToRow,
  type EventCategory,
  type EventTone,
  type GuildEventRow,
} from "../guild/guild-events";

const ALL_CHANNELS: ChannelName[] = ["guild", "guildchat"];

/** Scrolling within this much of the top of the list asks for the previous page of history. */
const LOAD_OLDER_AT_PX = 120;

// Presentational maps — the view-model carries a tone and a colour bucket; the classes live here.
const TONE_CLASSES: Record<EventTone, string> = {
  chat: "text-neutral-800 dark:text-neutral-100",
  replay: "text-cyan-600 dark:text-cyan-400",
  combat: "text-amber-600 dark:text-amber-400",
  kill: "font-semibold text-red-600 dark:text-red-400",
  gift: "text-emerald-600 dark:text-emerald-400",
  project: "text-blue-600 dark:text-blue-400",
  war: "text-fuchsia-600 dark:text-fuchsia-400",
  destroyed: "text-red-600 dark:text-red-400",
  crusade: "text-blue-600 dark:text-blue-400",
  join: "text-emerald-600 dark:text-emerald-400",
  leave: "text-red-600 dark:text-red-400",
  muted: "text-neutral-500 dark:text-neutral-400",
  unknown: "text-neutral-500 dark:text-neutral-400",
};

const NAME_CLASSES = [
  "text-cyan-600 dark:text-cyan-300",
  "text-fuchsia-600 dark:text-fuchsia-300",
  "text-amber-600 dark:text-amber-300",
  "text-emerald-600 dark:text-emerald-300",
  "text-blue-600 dark:text-blue-300",
  "text-sky-600 dark:text-sky-300",
  "text-pink-600 dark:text-pink-300",
  "text-yellow-600 dark:text-yellow-300",
  "text-green-600 dark:text-green-300",
  "text-indigo-600 dark:text-indigo-300",
];

// The "glowing archive" card surface, borrowed from raidman's GlowCard and expressed as plain
// Tailwind (this app has no cn()/utils helper or CSS-variable theme tokens).
const GLOW_CARD =
  "relative overflow-hidden rounded-lg border border-blue-500/30 bg-gradient-to-br from-blue-950/40 via-neutral-900/40 to-cyan-950/20";
const GLOW_BUTTON =
  "rounded-lg border border-blue-500/40 bg-gradient-to-br from-blue-600/70 via-blue-800/60 to-cyan-700/50 px-4 py-2 text-blue-50 transition-all duration-300 hover:border-blue-400/80 hover:from-blue-500/80 hover:to-cyan-600/60 hover:shadow-[0_0_18px_-2px_rgba(37,99,235,0.7)] disabled:cursor-default disabled:opacity-60";
// The glow look sized for the inline replay button: full width of its fixed column, with the hover
// bloom. No CSS transition on purpose — animating the hover on this semi-transparent gradient
// promotes the button to a temporary GPU layer on mouse enter/leave, which flips the text
// antialiasing and makes the label look like it shrinks. The hover colours and glow still apply,
// just instantly rather than animated.
const GLOW_BUTTON_UPLOAD =
  "w-full whitespace-nowrap rounded-md border border-blue-500/40 bg-gradient-to-br from-blue-600/70 via-blue-800/60 to-cyan-700/50 px-3 py-1.5 text-sm text-blue-50 hover:border-blue-400/80 hover:from-blue-500/80 hover:to-cyan-600/60 hover:shadow-[0_0_18px_-2px_rgba(37,99,235,0.7)] disabled:cursor-default disabled:opacity-60";

interface GuildChatTabProps {
  environment: Environment;
}

export function GuildChatTab({ environment }: GuildChatTabProps) {
  const [feed, setFeed] = useState<GuildFeed | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  // Empty means "no filter": show everything. Selecting categories narrows to just those.
  const [active, setActive] = useState<Set<EventCategory>>(() => new Set());
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const credentialsRef = useRef<Awaited<
    ReturnType<typeof findCredentials>
  > | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listHeightRef = useRef<number | null>(null);
  // Scrolling can ask for older history faster than React re-renders, so the guard is a ref.
  const loadingRef = useRef(false);

  useEffect(() => {
    setFeed(null);
    setStatus("");
    setUploads({});
    credentialsRef.current = null;
  }, [environment]);

  async function load() {
    loadingRef.current = true;
    setLoading(true);
    setStatus("Reading local credentials…");
    try {
      const credentials = await findCredentials(environment);
      credentialsRef.current = credentials;
      const loaded = await initGuildFeed(
        environment,
        credentials,
        ALL_CHANNELS,
        undefined,
        reportProgress,
      );
      setFeed(loaded);
      setStatus(feedStatus(loaded));
    } catch (error) {
      setStatus(`Failed: ${error}`);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  async function loadOlder() {
    if (!feed || !credentialsRef.current || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const updated = await loadOlderEvents(
        environment,
        credentialsRef.current,
        feed,
        reportProgress,
      );
      setFeed(updated);
      setStatus(feedStatus(updated));
    } catch (error) {
      setStatus(`Failed: ${error}`);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  // Each window is a socket round trip, so the feed is rendered as it arrives rather than at the
  // end of the load — the newest events are on screen while the older ones are still being read.
  function reportProgress(progress: LoadProgress) {
    setFeed(progress.feed);
    setStatus(`Reading guild history… ${progress.collected} events`);
  }

  async function uploadRow(replayId: string) {
    if (!feed || !credentialsRef.current) return;
    setUploads((current) => ({
      ...current,
      [replayId]: { status: "uploading" },
    }));
    try {
      const result = await uploadReplay(
        environment,
        credentialsRef.current,
        feed.guildId,
        replayId,
      );
      setUploads((current) => ({
        ...current,
        [replayId]: { status: "done", result },
      }));
    } catch (error) {
      setUploads((current) => ({
        ...current,
        [replayId]: { status: "error", error: `${error}` },
      }));
    }
  }

  // Reaching the top of the list is the "load older" gesture; the button below is the fallback.
  function onListScroll(event: UIEvent<HTMLDivElement>) {
    if (event.currentTarget.scrollTop > LOAD_OLDER_AT_PX) return;
    if (!feed || feed.exhausted) return;
    void loadOlder();
  }

  // The list reads like a chat window: oldest at the top, newest at the bottom. So it opens at the
  // bottom, and a load — which only ever adds events ABOVE what's shown — scrolls down by however
  // much the list grew, leaving the events being read exactly where they were.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) {
      listHeightRef.current = null;
      return;
    }
    const previousHeight = listHeightRef.current;
    listHeightRef.current = list.scrollHeight;
    if (previousHeight == null) {
      list.scrollTop = list.scrollHeight;
      return;
    }
    if (!loading) return;
    const growth = list.scrollHeight - previousHeight;
    if (growth > 0) list.scrollTop += growth;
  });

  const counts = useMemo(() => categoryCounts(feed), [feed]);
  const items = useMemo(() => buildItems(feed, active), [feed, active]);
  const shownCount = items.filter((item) => item.kind === "event").length;

  function toggleCategory(id: EventCategory) {
    setActive((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 text-left">
      <GuildChatHeader feed={feed} />

      {!feed && (
        <div className="flex flex-col items-center gap-2 py-8">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className={GLOW_BUTTON}
          >
            {loading ? "Loading…" : "Load guild chat"}
          </button>
        </div>
      )}

      {status && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {status}
        </p>
      )}

      {feed && (
        <>
          <CategoryFilterBar
            active={active}
            counts={counts}
            shown={shownCount}
            onToggle={toggleCategory}
            onClear={() => setActive(new Set())}
          />

          <p className="text-xs text-neutral-500 italic dark:text-neutral-400">
            Note: the server keeps a shorter history for some events (e.g. chat)
            than for others, so chat won't scroll back as far as guild events.
          </p>

          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={loadOlder}
              disabled={loading || feed.exhausted}
              className={GLOW_BUTTON}
            >
              {feed.exhausted
                ? "No older history"
                : loading
                  ? "Loading…"
                  : "Load older messages"}
            </button>
          </div>
          <div
            ref={listRef}
            onScroll={onListScroll}
            className={`${GLOW_CARD} flex max-h-[65vh] flex-col overflow-y-auto p-3`}
          >
            <GlowOrb />
            {items.length === 0 ? (
              <p className="py-6 text-center text-neutral-500 dark:text-neutral-400">
                No events to show.
              </p>
            ) : (
              <ol className="relative flex flex-col gap-0.5">
                {items.map((item) =>
                  item.kind === "chat-end" ? (
                    <ChatEndMarker key="chat-end" />
                  ) : (
                    <GuildEventLine
                      key={item.row.key}
                      row={item.row}
                      upload={
                        item.row.replayId
                          ? uploads[item.row.replayId]
                          : undefined
                      }
                      onUpload={
                        item.row.replayId
                          ? () => uploadRow(item.row.replayId as string)
                          : undefined
                      }
                    />
                  ),
                )}
              </ol>
            )}
          </div>

        </>
      )}
    </div>
  );
}

function GuildChatHeader({ feed }: { feed: GuildFeed | null }) {
  if (!feed) {
    return (
      <div>
        <h2 className="text-xl font-semibold">Guild Chat</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Scroll back through your guild's chat and events, read live from the
          game.
        </p>
      </div>
    );
  }
  const title = feed.guildName ?? feed.guildId;
  return (
    <div>
      <h2 className="text-xl font-semibold">
        {title}
        {feed.guildTag && (
          <span className="ml-2 text-neutral-500 dark:text-neutral-400">
            [{feed.guildTag}]
          </span>
        )}
      </h2>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Guild chat &amp; events
      </p>
    </div>
  );
}

type UploadState =
  | { status: "uploading" }
  | { status: "done"; result: ReplayUploadResult }
  | { status: "error"; error: string };

interface GuildEventLineProps {
  row: GuildEventRow;
  upload?: UploadState;
  onUpload?: () => void;
}

function GuildEventLine({ row, upload, onUpload }: GuildEventLineProps) {
  const nameClass = row.isServer
    ? "text-neutral-500 dark:text-neutral-400"
    : NAME_CLASSES[row.colorIndex];
  return (
    <li className="flex items-start gap-2 rounded px-1 py-0.5 font-mono text-sm leading-relaxed">
      <time className="shrink-0 tabular-nums text-neutral-400 dark:text-neutral-500">
        {formatEventTime(row.timestamp)}
      </time>
      <span
        className={`w-32 shrink-0 truncate font-semibold ${nameClass}`}
        title={row.author}
      >
        {row.author}
      </span>
      <span
        className={`min-w-0 grow break-words whitespace-pre-wrap ${TONE_CLASSES[row.tone]}`}
      >
        {row.text}
      </span>
      {row.replayId && onUpload && (
        <ReplayUploadControl upload={upload} onUpload={onUpload} />
      )}
    </li>
  );
}

function ChatEndMarker() {
  return (
    <li className="my-1 flex items-center gap-2 px-1 text-xs text-neutral-500 dark:text-neutral-400">
      <span className="h-px grow bg-neutral-500/30" />
      <span className="shrink-0">
        Start of chat history · older entries are guild events only
      </span>
      <span className="h-px grow bg-neutral-500/30" />
    </li>
  );
}

function ReplayUploadControl({
  upload,
  onUpload,
}: {
  upload?: UploadState;
  onUpload: () => void;
}) {
  // A fixed-width right-hand column so the button never resizes or shifts — whatever the state.
  return (
    <span className="flex w-56 shrink-0 flex-col items-stretch gap-0.5">
      {upload?.status === "done" ? (
        <>
          {upload.result.totalDamage != null && (
            <span className="text-right text-sm tabular-nums text-amber-600 dark:text-amber-400">
              {upload.result.totalDamage.toLocaleString("en-US")} dmg
            </span>
          )}
          <button
            type="button"
            onClick={() => void openUrl(raidmanReplayUrl(upload.result.hash))}
            className={GLOW_BUTTON_UPLOAD}
          >
            {upload.result.alreadyUploaded ? "View on Raidman ↗" : "Uploaded ↗"}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onUpload}
            disabled={upload?.status === "uploading"}
            className={GLOW_BUTTON_UPLOAD}
          >
            {upload?.status === "uploading"
              ? "Uploading…"
              : "Upload to Raidman"}
          </button>
          {upload?.status === "error" && (
            <span
              className="text-right text-xs text-red-600 dark:text-red-400"
              title={upload.error}
            >
              Upload failed
            </span>
          )}
        </>
      )}
    </span>
  );
}

function GlowOrb() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-blue-600/20 blur-2xl"
    />
  );
}

interface CategoryFilterBarProps {
  active: Set<EventCategory>;
  counts: Map<EventCategory, number>;
  shown: number;
  onToggle: (id: EventCategory) => void;
  onClear: () => void;
}

function CategoryFilterBar({
  active,
  counts,
  shown,
  onToggle,
  onClear,
}: CategoryFilterBarProps) {
  const filtering = active.size > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {EVENT_CATEGORIES.map((category) => {
          const on = active.has(category.id);
          const count = counts.get(category.id) ?? 0;
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(category.id)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                on
                  ? "border-blue-500/50 bg-blue-600/25 text-blue-100"
                  : "border-neutral-500/30 text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {category.label}
              <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
        <span>
          {filtering
            ? "Showing selected categories"
            : "Showing all events — select categories to filter"}
        </span>
        {filtering && (
          <button
            type="button"
            onClick={onClear}
            className="underline-offset-2 hover:underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto tabular-nums">{shown} shown</span>
      </div>
    </div>
  );
}

function categoryCounts(feed: GuildFeed | null): Map<EventCategory, number> {
  const counts = new Map<EventCategory, number>();
  if (!feed) return counts;
  for (const event of feed.events) {
    const category = eventCategory(event);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
}

type FeedItem = { kind: "event"; row: GuildEventRow } | { kind: "chat-end" };

function buildItems(
  feed: GuildFeed | null,
  active: Set<EventCategory>,
): FeedItem[] {
  if (!feed) return [];
  // No categories selected means no filter — show everything.
  const events =
    active.size === 0
      ? feed.events
      : feed.events.filter((event) => active.has(eventCategory(event)));
  // Oldest first, newest at the bottom, the way a chat window reads. Paging older prepends above,
  // which the list's scroll anchoring absorbs.
  const rows = events.map(guildEventToRow);

  // Once chat history is exhausted, mark where it starts: above the oldest visible guildchat row,
  // beyond which only older guild events remain.
  const firstChatIndex = feed.chatExhausted ? firstIndexOfChat(rows) : -1;
  const items: FeedItem[] = [];
  rows.forEach((row, index) => {
    if (index === firstChatIndex) {
      items.push({ kind: "chat-end" });
    }
    items.push({ kind: "event", row });
  });
  return items;
}

function firstIndexOfChat(rows: GuildEventRow[]): number {
  return rows.findIndex((row) => row.channel === "guildchat");
}

function feedStatus(feed: GuildFeed): string {
  const suffix = feed.exhausted
    ? " (reached the start of retained history)"
    : "";
  return `Loaded ${feed.events.length} events${suffix}.`;
}
