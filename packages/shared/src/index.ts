import { z } from "zod";

/* =========================================================
 * 定数
 * ======================================================= */
export const LIMITS = {
  usernameMin: 3,
  usernameMax: 32,
  displayNameMax: 48,
  passwordMin: 8,
  passwordMax: 128,
  serverNameMax: 64,
  channelNameMax: 48,
  messageMax: 4000,
  attachmentsPerMessage: 10,
  /** マルチパートアップロードの1パートのサイズ（64MB） */
  uploadPartSize: 64 * 1024 * 1024,
  messagePageSize: 50,
} as const;

export const CHANNEL_TYPES = ["TEXT", "VOICE", "KNOWLEDGE"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const MEMBER_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export type PresenceStatus = "online" | "offline";
export type TranslateLang = "ja" | "en";

/* =========================================================
 * 入力スキーマ（サーバー・クライアント両方で使う）
 * ======================================================= */
export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(LIMITS.usernameMin)
    .max(LIMITS.usernameMax)
    .regex(/^[a-zA-Z0-9_.-]+$/, "英数字と _ . - のみ使えます"),
  displayName: z.string().trim().min(1).max(LIMITS.displayNameMax),
  password: z.string().min(LIMITS.passwordMin).max(LIMITS.passwordMax),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(LIMITS.usernameMax),
  password: z.string().min(1).max(LIMITS.passwordMax),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createServerSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.serverNameMax),
});
export type CreateServerInput = z.infer<typeof createServerSchema>;

export const joinServerSchema = z.object({
  inviteCode: z.string().trim().min(6).max(32),
});
export type JoinServerInput = z.infer<typeof joinServerSchema>;

export const createChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.channelNameMax)
    .transform((s) => s.toLowerCase().replace(/\s+/g, "-")),
  type: z.enum(CHANNEL_TYPES),
  topic: z.string().trim().max(256).optional(),
});
export type CreateChannelInput = z.input<typeof createChannelSchema>;

export const sendMessageSchema = z
  .object({
    channelId: z.uuid(),
    content: z.string().max(LIMITS.messageMax),
    parentId: z.uuid().nullish(),
    attachmentIds: z.array(z.uuid()).max(LIMITS.attachmentsPerMessage).default([]),
    /** 再送時の二重投稿を防ぐためにクライアントが付ける番号 */
    nonce: z.string().min(8).max(64),
  })
  .refine((v) => v.content.trim().length > 0 || v.attachmentIds.length > 0, {
    message: "本文かファイルのどちらかが必要です",
  });
export type SendMessageInput = z.input<typeof sendMessageSchema>;

export const markReadSchema = z.object({
  channelId: z.uuid(),
  messageId: z.uuid(),
});
export type MarkReadInput = z.infer<typeof markReadSchema>;

export const typingSchema = z.object({ channelId: z.uuid() });

/* ---------- フェーズ2: アップロード ---------- */
export const initUploadSchema = z.object({
  channelId: z.uuid(),
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
});
export type InitUploadInput = z.infer<typeof initUploadSchema>;

export const completeUploadSchema = z.object({
  parts: z
    .array(z.object({ partNumber: z.number().int().min(1).max(10000), etag: z.string().min(1).max(256) }))
    .min(1)
    .max(10000),
});
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;

/* ---------- フェーズ2: 検索 ---------- */
export const searchQuerySchema = z.object({
  q: z.string().max(200).default(""),
  serverId: z.uuid().optional(),
  channelId: z.uuid().optional(),
  authorId: z.uuid().optional(),
  hasFile: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(1000).default(0),
});
export type SearchQuery = z.input<typeof searchQuerySchema>;

/* ---------- フェーズ2: AI ---------- */
export const summarizeSchema = z.object({
  channelId: z.uuid(),
  /** 未読要約: このメッセージより後ろを要約 */
  afterMessageId: z.uuid().nullish(),
  /** スレッド要約: 指定時はスレッド内だけ */
  threadId: z.uuid().nullish(),
  limit: z.number().int().min(5).max(500).default(200),
});
export type SummarizeInput = z.input<typeof summarizeSchema>;

export const translateSchema = z.object({
  messageId: z.uuid(),
  target: z.enum(["ja", "en"]),
});
export type TranslateInput = z.infer<typeof translateSchema>;

/* ---------- フェーズ3: 音声 ---------- */
export const voiceTokenSchema = z.object({ channelId: z.uuid() });

/* =========================================================
 * APIレスポンスの型（DTO）
 * ======================================================= */
export interface UserDTO {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserDTO;
}

export interface ServerDTO {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  myRole: MemberRole;
  createdAt: string;
}

export interface ChannelDTO {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
  topic: string | null;
  position: number;
  lastMessageId: string | null;
  /** 自分が最後に読んだメッセージ（未読判定用） */
  lastReadMessageId: string | null;
  createdAt: string;
}

export interface MemberDTO {
  user: UserDTO;
  role: MemberRole;
  status: PresenceStatus;
  joinedAt: string;
}

export interface AttachmentDTO {
  id: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface MessageDTO {
  id: string;
  channelId: string;
  serverId: string;
  author: UserDTO;
  content: string;
  parentId: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  attachments: AttachmentDTO[];
  createdAt: string;
  /** 送信者が付けた nonce（自分の送信中メッセージと突き合わせる） */
  nonce?: string;
}

export interface MessagePage {
  messages: MessageDTO[];
  hasMore: boolean;
}

export interface InitUploadResponse {
  attachmentId: string;
  uploadId: string;
  partSize: number;
  parts: { partNumber: number; url: string }[];
}

export interface SearchHitDTO {
  id: string;
  channelId: string;
  channelName: string;
  serverId: string;
  authorId: string;
  authorName: string;
  /** スレッド内の返信ならスレッドの親メッセージID */
  parentId: string | null;
  /** 一致箇所は \u0001 ... \u0002 で囲まれている（HTMLを使わず安全に強調表示するため） */
  highlighted: string;
  hasAttachment: boolean;
  filenames: string[];
  createdAt: string;
}

export interface SearchResponse {
  hits: SearchHitDTO[];
  estimatedTotal: number;
  processingTimeMs: number;
}

export interface TranslateResponse {
  messageId: string;
  target: TranslateLang;
  text: string;
  cached: boolean;
}

export interface VoiceTokenResponse {
  token: string;
  url: string;
  roomName: string;
}

export interface VoiceParticipantDTO {
  userId: string;
  displayName: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isScreenSharing: boolean;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/* =========================================================
 * Socket.io のイベント型
 * ======================================================= */
export type Ack<T> = (res: { ok: true; data: T } | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  "message:send": (payload: SendMessageInput, ack: Ack<MessageDTO>) => void;
  "typing:start": (payload: { channelId: string }) => void;
  "channel:read": (payload: MarkReadInput) => void;
  "presence:heartbeat": () => void;
}

export interface ServerToClientEvents {
  "message:new": (message: MessageDTO) => void;
  "thread:updated": (payload: {
    channelId: string;
    rootId: string;
    replyCount: number;
    lastReplyAt: string;
  }) => void;
  typing: (payload: { channelId: string; userId: string; displayName: string }) => void;
  presence: (payload: { userId: string; status: PresenceStatus }) => void;
  "channel:created": (channel: ChannelDTO) => void;
  "member:joined": (payload: { serverId: string; member: MemberDTO }) => void;
  "server:joined": (server: ServerDTO) => void;
  "voice:updated": (payload: { channelId: string }) => void;
}

export interface SocketData {
  userId: string;
  username: string;
  displayName: string;
}
