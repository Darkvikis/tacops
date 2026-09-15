import type { Credentials, Environment } from "../api/types";
import {
  guildFeedInit,
  readChannelWindow,
  type ChannelName,
  type GuildFeedInit,
  type RawChannelEvent,
} from "../api/guild-chat";

/**
 * Scrollback over a guild's two channels, `guild` (guild events) and `guildchat` (chat + shared
 * replays). They are independent seq spaces, and the server has no history API: the only way to read
 * old events is to subscribe the realtime socket at a seq and take the window it replays.
 *
 * That window is a stable function of the seq asked for: a request at S is answered with
 * `[S + offset, S + offset + width - 1]`, CLAMPED to the channel's newest event and to the oldest it
 * still retains. Both the offset and the width are per-channel and not documented anywhere — measured
 * against the live service (Sep 2026) `guild` answers with the ~1500 events straight after S, while
 * `guildchat` answers with a 220-event window starting ~1710 seqs ABOVE S. So requests within ~1930
 * seqs of the chat head all clamp to the same newest window, and a reader that steps its request down
 * blindly looks "stuck" for nine steps before it starts moving.
 *
 * Rather than hard-code either number, each channel measures its own offset once (probe downward
 * until the window moves below the head window, then offset = window start - seq asked) and pages in
 * WINDOW space after that: aim the next window to end just above the oldest contiguous seq held, and
 * convert back to a request seq through the offset. The width is re-measured from every window, so a
 * channel that serves narrower windows near its retention floor simply takes smaller steps.
 *
 * History is merged by (channel, seq) and each channel tracks the oldest seq it holds with no gap
 * below it. To keep the merged feed consistent as the user pages back, the `guild` channel anchors
 * each step and `guildchat` is read back to the same timestamp — so every "load older" only adds
 * events OLDER than what's shown. When guildchat runs out of retained history first, it's marked
 * exhausted so the UI can show where chat history ends.
 *
 * Every window takes a socket round trip, so a load is published as it goes rather than at the end:
 * `onProgress` carries the feed as it stands after each window, and the view can render the first
 * one (a couple of seconds in) while the rest is still arriving.
 */

/** Seqs a new window keeps in common with the one above it, so a varying width can't open a gap. */
const WINDOW_OVERLAP = 20;
/** Margin below the newest seq used to ask for the head window; the server clamps it to the head. */
const HEAD_MARGIN = 250;
/** How far below the head to probe when measuring a channel's offset, until a window moves below it. */
const PROBE_DELTAS = [500, 1000, 2000, 4000, 8000];
/** Guild events to add per "load older" — the step that sets the timestamp guildchat aligns to. */
const GUILD_BATCH = 1000;
/** Chat events to add per "load older" once guild history is exhausted and there's no anchor left. */
const CHAT_BATCH = 400;
/** Consecutive windows that reach nothing older before a channel is treated as out of history. */
const STALLED_DONE = 2;
/** Safety cap on windows read in a single channel walk. */
const MAX_WINDOWS = 24;

interface ChannelCursor {
  channel: ChannelName;
  /** Seqs the server adds to a requested seq before the window it serves begins. */
  offset: number;
  /** Events in the last window served — the stride of the next step back. */
  width: number;
  /** Oldest seq held with no gap below it; the next window is aimed to end just above it. */
  oldest: number;
  done: boolean;
}

export interface GuildFeed {
  guildId: string;
  guildName: string | null;
  guildTag: string | null;
  channels: ChannelName[];
  cursors: ChannelCursor[];
  /** Merged, deduped, ascending by timestamp (oldest first, newest last). */
  events: RawChannelEvent[];
  /** True once every channel has run out of retained history. */
  exhausted: boolean;
  /** True once the guildchat channel specifically has no older history left. */
  chatExhausted: boolean;
  /** Oldest guildchat timestamp loaded — where the "start of chat history" marker sits. */
  chatOldestTimestamp: number | null;
}

export interface LoadProgress {
  /** Events added by the load so far. */
  collected: number;
  /** The feed as it stands, ready to render while the rest of the load is still running. */
  feed: GuildFeed;
}

/** The guild a read is against, and everything a walk needs to read and publish windows. */
interface FeedContext {
  environment: Environment;
  credentials: Credentials;
  guild: GuildInfo;
  channels: ChannelName[];
  merged: Map<string, RawChannelEvent>;
  cursors: Map<ChannelName, ChannelCursor>;
  /** Publishes the feed as it stands; called after every window. */
  report: () => void;
}

type GuildInfo = Pick<GuildFeedInit, "guildId" | "guildName" | "guildTag">;

export async function initGuildFeed(
  environment: Environment,
  credentials: Credentials,
  channels: ChannelName[],
  guildId?: string,
  onProgress?: (progress: LoadProgress) => void,
): Promise<GuildFeed> {
  const info = await guildFeedInit(environment, credentials, guildId);
  const context = createContext(
    environment,
    credentials,
    info,
    channels,
    [],
    null,
    onProgress,
  );
  await Promise.all(
    channels.map((channel) =>
      discoverChannel(context, channel, info.seqs[channel]),
    ),
  );
  // One aligned step so the first view already has both channels back to a common time.
  await collectOlder(context);
  return snapshot(context);
}

export async function loadOlderEvents(
  environment: Environment,
  credentials: Credentials,
  feed: GuildFeed,
  onProgress?: (progress: LoadProgress) => void,
): Promise<GuildFeed> {
  const context = createContext(
    environment,
    credentials,
    feed,
    feed.channels,
    feed.events,
    feed.cursors,
    onProgress,
  );
  await collectOlder(context);
  return snapshot(context);
}

/**
 * A load's working state. Channels that haven't been discovered yet start on a placeholder cursor
 * that reports as "not exhausted", so a feed published mid-discovery doesn't briefly claim a channel
 * has run out of history.
 */
function createContext(
  environment: Environment,
  credentials: Credentials,
  guild: GuildInfo,
  channels: ChannelName[],
  events: RawChannelEvent[],
  cursors: ChannelCursor[] | null,
  onProgress?: (progress: LoadProgress) => void,
): FeedContext {
  const merged = new Map(events.map((event) => [eventKey(event), event]));
  const startingSize = merged.size;
  const context: FeedContext = {
    environment,
    credentials,
    guild,
    channels,
    merged,
    cursors: new Map(
      (cursors ?? channels.map(undiscovered)).map((cursor) => [
        cursor.channel,
        cursor,
      ]),
    ),
    report: () =>
      onProgress?.({
        collected: merged.size - startingSize,
        feed: snapshot(context),
      }),
  };
  return context;
}

function readWindow(
  context: FeedContext,
  channel: ChannelName,
  seq: number,
): Promise<RawChannelEvent[]> {
  return readChannelWindow(
    context.environment,
    context.credentials,
    context.guild.guildId,
    channel,
    seq,
  );
}

/**
 * Sets a channel up for paging: reads the window at the head — publishing it, so the newest events
 * are on screen while the rest of the load runs — then measures the channel's offset by probing
 * further and further below it until a window comes back that starts below the head window. Requests
 * inside the offset all clamp to the head window, so the probe is the only way to tell how far a
 * request has to drop before it moves. The probe's own events are deliberately NOT merged — the jump
 * can land below a gap, which the walk fills on the way down.
 */
async function discoverChannel(
  context: FeedContext,
  channel: ChannelName,
  top: number | null,
): Promise<void> {
  if (top == null) {
    return settle(context, exhausted(channel));
  }

  const headSeq = Math.max(top - HEAD_MARGIN, 0);
  const head = await readWindow(context, channel, headSeq);
  if (head.length === 0) {
    return settle(context, exhausted(channel));
  }
  addAll(context.merged, head);
  const headOldest = minSeq(head);
  context.report();

  for (const delta of PROBE_DELTAS) {
    const seq = Math.max(headSeq - delta, 0);
    const window = await readWindow(context, channel, seq);
    context.report();
    if (window.length > 0 && minSeq(window) < headOldest) {
      return settle(context, {
        channel,
        offset: minSeq(window) - seq,
        width: span(window),
        oldest: headOldest,
        done: false,
      });
    }
    if (seq === 0) {
      break;
    }
  }
  // Nothing below the head window: this is all the history the server still has.
  return settle(context, { ...exhausted(channel), oldest: headOldest });
}

async function collectOlder(context: FeedContext): Promise<void> {
  const guild = context.cursors.get("guild");
  const chat = context.cursors.get("guildchat");

  if (guild && !guild.done) {
    // Guild anchors the step; guildchat then catches up to guild's new oldest timestamp.
    await walkByCount(context, guild, GUILD_BATCH);
    const targetTimestamp = oldestTimestamp(context.merged, "guild");
    if (chat && !chat.done && targetTimestamp != null) {
      await walkToTimestamp(context, chat, targetTimestamp);
    }
  } else if (chat && !chat.done) {
    // Guild history is exhausted, so there's no anchor left — let guildchat page on its own.
    await walkByCount(context, chat, CHAT_BATCH);
  }
}

/** Reads windows downward until `target` new events have been added (or the channel is exhausted). */
function walkByCount(
  context: FeedContext,
  cursor: ChannelCursor,
  target: number,
): Promise<void> {
  let added = 0;
  return walkDown(context, cursor, (addedThisWindow) => {
    added += addedThisWindow;
    return added < target;
  });
}

/** Reads windows downward until the channel's oldest loaded event is at/older than `targetTimestamp`. */
function walkToTimestamp(
  context: FeedContext,
  cursor: ChannelCursor,
  targetTimestamp: number,
): Promise<void> {
  return walkDown(context, cursor, () => {
    const oldest = oldestTimestamp(context.merged, cursor.channel);
    return oldest == null || oldest > targetTimestamp;
  });
}

/**
 * Shared downward walk. Each step aims the next window to end `WINDOW_OVERLAP` seqs inside the oldest
 * contiguous seq held, converts that to a request seq through the channel's offset, and merges what
 * comes back. Three outcomes:
 *
 *   - the window reaches below the watermark: progress, keep going;
 *   - the window comes back entirely above the watermark (a hole — the server served a narrower
 *     window than the last one did): re-measured width moves the next aim up, so retry;
 *   - the window repeats what's already held: the retention floor, so the channel is done.
 *
 * The cursor is committed and the feed published after every window, so a long walk shows its
 * progress rather than landing all at once.
 */
async function walkDown(
  context: FeedContext,
  cursor: ChannelCursor,
  keepGoing: (addedThisWindow: number) => boolean,
): Promise<void> {
  if (cursor.done) {
    return;
  }
  let current = cursor;
  let stalled = 0;
  for (let windows = 0; windows < MAX_WINDOWS; windows += 1) {
    const start = current.oldest - 1 + WINDOW_OVERLAP - (current.width - 1);
    const seq = Math.max(start - current.offset, 0);
    const window = await readWindow(context, current.channel, seq);
    let added = 0;
    for (const event of window) {
      const key = eventKey(event);
      if (!context.merged.has(key)) added += 1;
      context.merged.set(key, event);
    }
    if (window.length > 0) {
      current = { ...current, width: span(window) };
    }

    const watermark = contiguousOldest(
      context.merged,
      current.channel,
      current.oldest,
    );
    if (watermark < current.oldest) {
      current = { ...current, oldest: watermark };
      settle(context, current);
      stalled = 0;
      if (!keepGoing(added)) {
        return;
      }
      continue;
    }
    // A hole above the window means the aim overshot; the re-measured width pulls it back up, so let
    // that retry run without counting against the stall budget.
    const hole = window.length > 0 && maxSeq(window) < current.oldest - 1;
    if (hole && windows + 1 < MAX_WINDOWS) {
      settle(context, current);
      continue;
    }
    stalled += 1;
    if (stalled >= STALLED_DONE || seq === 0) {
      return settle(context, { ...current, done: true });
    }
    settle(context, current);
  }
  settle(context, current);
}

/** Commits a channel's cursor and publishes the feed as it now stands. */
function settle(context: FeedContext, cursor: ChannelCursor): void {
  context.cursors.set(cursor.channel, cursor);
  context.report();
}

function snapshot(context: FeedContext): GuildFeed {
  const cursors = [...context.cursors.values()];
  return {
    guildId: context.guild.guildId,
    guildName: context.guild.guildName,
    guildTag: context.guild.guildTag,
    channels: context.channels,
    cursors,
    events: [...context.merged.values()].sort(byTimestamp),
    exhausted: cursors.every((cursor) => cursor.done),
    chatExhausted:
      cursors.find((cursor) => cursor.channel === "guildchat")?.done ?? true,
    chatOldestTimestamp: oldestTimestamp(context.merged, "guildchat"),
  };
}

/** A channel that hasn't been read yet: nothing held, and nothing yet known to be exhausted. */
function undiscovered(channel: ChannelName): ChannelCursor {
  return { channel, offset: 0, width: 1, oldest: 0, done: false };
}

function exhausted(channel: ChannelName): ChannelCursor {
  return { ...undiscovered(channel), done: true };
}

function addAll(
  merged: Map<string, RawChannelEvent>,
  events: RawChannelEvent[],
) {
  for (const event of events) {
    merged.set(eventKey(event), event);
  }
}

/** The oldest seq held for a channel with no gap below it — where the next window has to reach. */
function contiguousOldest(
  merged: Map<string, RawChannelEvent>,
  channel: ChannelName,
  from: number,
): number {
  let oldest = from;
  while (oldest > 0 && merged.has(`${channel}:${oldest - 1}`)) {
    oldest -= 1;
  }
  return oldest;
}

function oldestTimestamp(
  merged: Map<string, RawChannelEvent>,
  channel: ChannelName,
): number | null {
  let oldest: number | null = null;
  for (const event of merged.values()) {
    if (event.channel !== channel || event.timestamp == null) continue;
    if (oldest == null || event.timestamp < oldest) oldest = event.timestamp;
  }
  return oldest;
}

function minSeq(events: RawChannelEvent[]): number {
  return events.reduce(
    (min, event) => Math.min(min, event.seq),
    Number.MAX_SAFE_INTEGER,
  );
}

function maxSeq(events: RawChannelEvent[]): number {
  return events.reduce((max, event) => Math.max(max, event.seq), 0);
}

/** Events in a window, measured from its seq span rather than its length (frames can repeat). */
function span(events: RawChannelEvent[]): number {
  return maxSeq(events) - minSeq(events) + 1;
}

function eventKey(event: RawChannelEvent): string {
  return `${event.channel}:${event.seq}`;
}

function byTimestamp(a: RawChannelEvent, b: RawChannelEvent): number {
  return (a.timestamp ?? 0) - (b.timestamp ?? 0);
}
