import type {
  ChannelName,
  EventUser,
  RawChannelEvent,
} from "../api/guild-chat";

/**
 * Turns a raw guild/guildchat channel event into a plain view-model row: an author, a timestamp,
 * and a one-line description tagged with a `tone` the component maps to a colour. This is the
 * TypeScript port of the raidman guild-chat-cli renderer — same descriptions, minus the terminal
 * colours (which become tones) and the project-name catalog (which needs game config this app
 * doesn't load, so project events fall back to a generic label).
 */

export type EventTone =
  | "chat"
  | "replay"
  | "muted"
  | "combat"
  | "kill"
  | "gift"
  | "project"
  | "war"
  | "destroyed"
  | "crusade"
  | "join"
  | "leave"
  | "unknown";

export interface GuildEventRow {
  key: string;
  channel: ChannelName;
  timestamp: number;
  author: string;
  isServer: boolean;
  /** Stable per-member colour bucket; the component maps it to a class. */
  colorIndex: number;
  text: string;
  tone: EventTone;
  /** Set for shared-replay events — the id used to fetch and re-upload the replay. */
  replayId?: string;
}

export const NAME_COLOR_COUNT = 10;

const KNOWN_TYPES = new Set([
  "GuildChatEvent",
  "GuildReplayEvent",
  "IdunGuildBossEncounterStarted",
  "IdunGuildBossEncounterCompleted",
  "IdunGuildBossEncounterKilled",
  "IdunGiftingRequestCreated",
  "IdunGuildDonateToGiftRequest",
  "GuildUpdatedEvent",
  "GuildQuestUpdated",
  "GuildProjectStateUpdated",
  "GuildProjectStateUpdatedMessage",
  "GuildProjectProgressUpdated",
  "GuildWarTargetMarked",
  "GuildWarTargetZoneSet",
  "GuildWarTargetZoneDestroyed",
  "CrusadeTargetPlanetSet",
  "CrusadeSideSet",
  "GuildMemberJoinedEvent",
  "GuildMemberLeftEvent",
]);

/**
 * The known event types grouped into filterable categories. Every known type belongs to exactly
 * one; anything unrecognised falls into "other". EVENT_CATEGORIES is the display order.
 */
export type EventCategory =
  | "chat"
  | "replays"
  | "boss"
  | "gifts"
  | "projects"
  | "war"
  | "crusade"
  | "members"
  | "guild"
  | "other";

export const EVENT_CATEGORIES: { id: EventCategory; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "replays", label: "Replays" },
  { id: "boss", label: "Boss battles" },
  { id: "gifts", label: "Gifts" },
  { id: "projects", label: "Projects" },
  { id: "war", label: "Guild war" },
  { id: "crusade", label: "Crusade" },
  { id: "members", label: "Members" },
  { id: "guild", label: "Guild & quests" },
  { id: "other", label: "Other" },
];

const CATEGORY_BY_TYPE: Record<string, EventCategory> = {
  GuildChatEvent: "chat",
  GuildReplayEvent: "replays",
  IdunGuildBossEncounterStarted: "boss",
  IdunGuildBossEncounterCompleted: "boss",
  IdunGuildBossEncounterKilled: "boss",
  IdunGiftingRequestCreated: "gifts",
  IdunGuildDonateToGiftRequest: "gifts",
  GuildProjectStateUpdated: "projects",
  GuildProjectStateUpdatedMessage: "projects",
  GuildProjectProgressUpdated: "projects",
  GuildWarTargetMarked: "war",
  GuildWarTargetZoneSet: "war",
  GuildWarTargetZoneDestroyed: "war",
  CrusadeTargetPlanetSet: "crusade",
  CrusadeSideSet: "crusade",
  GuildMemberJoinedEvent: "members",
  GuildMemberLeftEvent: "members",
  GuildUpdatedEvent: "guild",
  GuildQuestUpdated: "guild",
};

export function eventCategory(event: RawChannelEvent): EventCategory {
  return CATEGORY_BY_TYPE[event.type] ?? "other";
}

export function guildEventToRow(event: RawChannelEvent): GuildEventRow {
  const author = eventAuthor(event);
  const described = KNOWN_TYPES.has(event.type)
    ? describeKnown(event)
    : describeUnknown(event);
  return {
    key: `${event.channel}:${event.seq}`,
    channel: event.channel,
    timestamp: event.timestamp ?? 0,
    author: author?.displayName ?? author?.userId ?? "(server)",
    isServer: author == null,
    colorIndex: colorIndexFor(
      author?.userId ?? author?.displayName ?? "(server)",
    ),
    text: described.text,
    tone: described.tone,
    replayId: replayIdForEvent(event),
  };
}

/** The replay id of a shared-replay event, else undefined. */
export function replayIdForEvent(event: RawChannelEvent): string | undefined {
  if (event.type !== "GuildReplayEvent") {
    return undefined;
  }
  return parseReplayContent(event).replayId;
}

interface Described {
  text: string;
  tone: EventTone;
}

function describeKnown(event: RawChannelEvent): Described {
  switch (event.type) {
    case "GuildChatEvent":
      return { text: event.content ?? "", tone: "chat" };
    case "GuildReplayEvent":
      return {
        text: describeReplay(parseReplayContent(event)),
        tone: "replay",
      };
    case "IdunGuildBossEncounterStarted":
      return {
        text: `⚔ started a ${encounterTypeName(asString(event.guildBossEncounterType))} battle`,
        tone: "muted",
      };
    case "IdunGuildBossEncounterCompleted":
      return describeEncounterCompleted(
        parsePayload<EncounterCompletedContent>(event),
      );
    case "IdunGuildBossEncounterKilled":
      return describeBossKilled(parsePayload<BossKilledContent>(event));
    case "IdunGiftingRequestCreated":
      return { text: "🎁 requested a gift", tone: "gift" };
    case "IdunGuildDonateToGiftRequest":
      return { text: "🎁 donated to a gift request", tone: "gift" };
    case "GuildUpdatedEvent":
      return { text: "✱ updated the guild", tone: "muted" };
    case "GuildQuestUpdated":
      return describeQuestUpdated(parsePayload<QuestUpdatedContent>(event));
    case "GuildProjectStateUpdated":
      return describeProjectState(parsePayload<ProjectStateContent>(event));
    case "GuildProjectStateUpdatedMessage":
      return describeProjectStateMessage(
        parsePayload<ProjectStateMessageContent>(event),
      );
    case "GuildProjectProgressUpdated":
      return describeProjectProgress(
        parsePayload<ProjectProgressContent>(event),
      );
    case "GuildWarTargetMarked":
      return {
        text: `⚑ marked guild war target ${parsePayload<WarTargetMarkedData>(event).targetId}`,
        tone: "war",
      };
    case "GuildWarTargetZoneSet": {
      const data = parsePayload<WarZoneTargetData>(event);
      return {
        text: `⚑ set guild war target on ${data.visualId} (${data.targetId})`,
        tone: "war",
      };
    }
    case "GuildWarTargetZoneDestroyed": {
      const data = parsePayload<WarZoneTargetData>(event);
      return {
        text: `☠ destroyed guild war zone ${data.visualId} (${data.targetId})`,
        tone: "destroyed",
      };
    }
    case "CrusadeTargetPlanetSet":
      return {
        text: `✠ set crusade target to ${parsePayload<CrusadeTargetPlanetContent>(event).planetId}`,
        tone: "crusade",
      };
    case "CrusadeSideSet":
      return {
        text: `✠ set crusade side to ${parsePayload<CrusadeSideContent>(event).side}`,
        tone: "crusade",
      };
    case "GuildMemberJoinedEvent":
      return { text: "→ joined the guild", tone: "join" };
    case "GuildMemberLeftEvent":
      return { text: "← left the guild", tone: "leave" };
    default:
      return describeUnknown(event);
  }
}

interface ReplayContent {
  gameMode: string;
  replayId: string;
  battleVersion?: string;
  metaData?: string;
}

interface EncounterCompletedContent {
  damageDealt: number;
  damageType: "Battle" | "Bomb";
  currentHp: number;
  guildBossEncounterType: "Boss" | "Crystal" | null;
}

interface BossKilledContent {
  unitBossId: string;
  guildBossEncounterType: "Boss" | "Crystal";
  damageDealt: number;
  tierIndex: number;
  setIndex: number;
  setCount: number;
}

interface QuestUpdatedContent {
  taskIndex: number;
  newAmount: number;
  oldAmount: number;
}

interface ProjectStateContent {
  projectId: string;
  oldState: string | null;
  newState: string | null;
}

interface ProjectStateMessageContent {
  projectId: string;
  state: string;
}

interface ProjectProgressContent {
  projectId: string;
  progress: number;
}

interface WarTargetMarkedData {
  targetId: string;
}

interface WarZoneTargetData {
  visualId: string;
  targetId: string;
}

interface CrusadeTargetPlanetContent {
  planetId: string;
}

interface CrusadeSideContent {
  side: string;
}

function describeReplay(content: ReplayContent): string {
  // replayId and battleVersion are intentionally left out of the visible line — the replay id is
  // available through the upload button, not shown as noise.
  const fields: [string, unknown][] = [
    ...Object.entries(parseReplayMetaData(content)),
  ];
  const present = fields.filter(([, value]) => value != null);
  return [
    `▶ shared a ${content.gameMode} replay`,
    ...present.map(([key, value]) => `${key}=${formatFieldValue(key, value)}`),
  ].join(" · ");
}

function formatFieldValue(key: string, value: unknown): string {
  if (key === "bossUnitId") {
    return bossName(String(value));
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function describeEncounterCompleted(
  content: EncounterCompletedContent,
): Described {
  const target = encounterTypeName(content.guildBossEncounterType);
  const damage = formatNumber(content.damageDealt);
  if (content.damageType === "Bomb") {
    return { text: `💣 bombed the ${target} for ${damage}`, tone: "combat" };
  }
  const hpLeft =
    content.currentHp >= 0
      ? ` · ${formatNumber(content.currentHp)} HP left`
      : "";
  return { text: `⚔ hit the ${target} for ${damage}${hpLeft}`, tone: "combat" };
}

function describeBossKilled(content: BossKilledContent): Described {
  const where = `tier ${content.tierIndex}, set ${content.setIndex + 1}/${content.setCount}`;
  const target = encounterTypeName(content.guildBossEncounterType);
  return {
    text: `☠ killed ${bossName(content.unitBossId)} (${target}, ${where}) · ${formatNumber(content.damageDealt)} damage`,
    tone: "kill",
  };
}

function describeQuestUpdated(content: QuestUpdatedContent): Described {
  const delta = content.newAmount - content.oldAmount;
  const sign = delta >= 0 ? "+" : "";
  return {
    text: `◆ guild quest task ${content.taskIndex + 1}: ${formatNumber(content.oldAmount)} → ${formatNumber(content.newAmount)} (${sign}${formatNumber(delta)})`,
    tone: "muted",
  };
}

function describeProjectState(content: ProjectStateContent): Described {
  const to = content.newState ?? "none";
  const transition = content.oldState ? `${content.oldState} → ${to}` : to;
  return {
    text: `⚒ ${projectLabel(content.projectId)} ${transition}`,
    tone: "project",
  };
}

function describeProjectStateMessage(
  content: ProjectStateMessageContent,
): Described {
  return {
    text: `⚒ ${projectLabel(content.projectId)} ${content.state}`,
    tone: "project",
  };
}

function describeProjectProgress(content: ProjectProgressContent): Described {
  return {
    text: `⚒ ${projectLabel(content.projectId)} progress ${formatNumber(content.progress)}`,
    tone: "project",
  };
}

/**
 * This app doesn't load the game-config/localization bundles the CLI's project catalog uses, so a
 * project's real name isn't available; show a generic label like the catalog-less CLI path does.
 */
function projectLabel(_projectId: string): string {
  return "guild project";
}

function describeUnknown(event: RawChannelEvent): Described {
  const {
    timestamp: _timestamp,
    seq: _seq,
    channel: _channel,
    ...rest
  } = event;
  return { text: JSON.stringify(rest), tone: "unknown" };
}

/**
 * An event's detail payload, which the serializer puts either in `data` (an object) or `content`
 * (a JSON string), depending on the event.
 */
function parsePayload<T>(event: RawChannelEvent): T {
  const raw = event.data ?? event.content;
  if (raw == null) {
    throw new Error(`${event.type} has no payload to parse`);
  }
  if (typeof raw === "object") {
    return raw as T;
  }
  try {
    return JSON.parse(String(raw)) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse ${event.type} payload: ${(error as Error).message}`,
    );
  }
}

function parseReplayContent(event: RawChannelEvent): ReplayContent {
  return parsePayload<ReplayContent>(event);
}

function parseReplayMetaData(content: ReplayContent): Record<string, unknown> {
  if (content.metaData == null) {
    return {};
  }
  try {
    return JSON.parse(content.metaData) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Failed to parse replay metaData: ${(error as Error).message}`,
    );
  }
}

function eventAuthor(event: RawChannelEvent): EventUser | undefined {
  if (event.sourceUser) {
    return event.sourceUser;
  }
  if (typeof event.sourceDisplayName === "string") {
    return {
      userId: asString(event.sourceUserId),
      displayName: event.sourceDisplayName,
    };
  }
  return undefined;
}

/** The API calls the sideboss a "Crystal"; in-game they're Primes. */
function encounterTypeName(type: string | null | undefined): string {
  if (type === "Crystal") {
    return "Prime";
  }
  return type ?? "boss";
}

/** "GuildBoss10Boss1AdmecBelisarius:23" → "AdmecBelisarius". */
function bossName(unitBossId: string): string {
  return unitBossId.replace(/^GuildBoss\d+Boss\d+/, "").replace(/:\d+$/, "");
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Each member gets a stable colour bucket keyed on their identity (FNV-ish, matching the CLI). */
function colorIndexFor(identity: string): number {
  let value = 0;
  for (const char of identity) {
    value = (value * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return value % NAME_COLOR_COUNT;
}

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** Local-time "Jul 9 20:39", matching the CLI's one-line timestamp. */
export function formatEventTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${MONTHS[date.getMonth()]} ${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
