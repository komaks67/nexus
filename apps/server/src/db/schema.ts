import { relations, sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * ID はすべて UUID v7（作成時刻が先頭に入る UUID）。
 * → ID の大小がそのまま「作られた順番」になるので、並び替えやページ送りが速い。
 */

export const channelTypeEnum = pgEnum("channel_type", ["TEXT", "VOICE", "KNOWLEDGE"]);
export const memberRoleEnum = pgEnum("member_role", ["OWNER", "ADMIN", "MEMBER"]);
export const attachmentStatusEnum = pgEnum("attachment_status", ["PENDING", "UPLOADED"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ---------------- users ---------------- */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    username: varchar("username", { length: 32 }).notNull(),
    displayName: varchar("display_name", { length: 48 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    avatarColor: varchar("avatar_color", { length: 7 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_username_lower_idx").on(sql`lower(${t.username})`)],
);

/* ---------------- servers（コミュニティ） ---------------- */
export const servers = pgTable(
  "servers",
  {
    id: uuid("id").primaryKey(),
    name: varchar("name", { length: 64 }).notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    inviteCode: varchar("invite_code", { length: 32 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("servers_invite_code_idx").on(t.inviteCode)],
);

/* ---------------- server_members ---------------- */
export const serverMembers = pgTable(
  "server_members",
  {
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("MEMBER"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.serverId, t.userId] }), index("server_members_user_idx").on(t.userId)],
);

/* ---------------- channels ---------------- */
export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 48 }).notNull(),
    type: channelTypeEnum("type").notNull().default("TEXT"),
    topic: varchar("topic", { length: 256 }),
    position: integer("position").notNull().default(0),
    /** 最新メッセージ（未読バッジ用） */
    lastMessageId: uuid("last_message_id"),
    createdAt: createdAt(),
  },
  (t) => [index("channels_server_idx").on(t.serverId, t.position)],
);

/* ---------------- messages（スレッド返信対応） ---------------- */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull().default(""),
    /** スレッドの親メッセージ。NULL ならチャンネル本体の発言 */
    parentId: uuid("parent_id").references((): AnyPgColumn => messages.id, { onDelete: "cascade" }),
    replyCount: integer("reply_count").notNull().default(0),
    lastReplyAt: timestamp("last_reply_at", { withTimezone: true }),
    /** 同じ送信の二重登録を防ぐ */
    nonce: varchar("nonce", { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_channel_parent_id_idx").on(t.channelId, t.parentId, t.id),
    index("messages_parent_idx").on(t.parentId, t.id),
    uniqueIndex("messages_author_nonce_idx").on(t.authorId, t.nonce),
  ],
);

/* ---------------- attachments（フェーズ2） ---------------- */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey(),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 255 }).notNull(),
    contentType: varchar("content_type", { length: 255 }).notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    storageKey: text("storage_key").notNull(),
    uploadId: text("upload_id"),
    status: attachmentStatusEnum("status").notNull().default("PENDING"),
    createdAt: createdAt(),
  },
  (t) => [index("attachments_message_idx").on(t.messageId)],
);

/* ---------------- channel_reads（未読管理） ---------------- */
export const channelReads = pgTable(
  "channel_reads",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    lastReadMessageId: uuid("last_read_message_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.channelId] })],
);

/* ---------------- relations ---------------- */
export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(serverMembers),
  messages: many(messages),
}));

export const serversRelations = relations(servers, ({ one, many }) => ({
  owner: one(users, { fields: [servers.ownerId], references: [users.id] }),
  members: many(serverMembers),
  channels: many(channels),
}));

export const serverMembersRelations = relations(serverMembers, ({ one }) => ({
  server: one(servers, { fields: [serverMembers.serverId], references: [servers.id] }),
  user: one(users, { fields: [serverMembers.userId], references: [users.id] }),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  server: one(servers, { fields: [channels.serverId], references: [servers.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  channel: one(channels, { fields: [messages.channelId], references: [channels.id] }),
  author: one(users, { fields: [messages.authorId], references: [users.id] }),
  parent: one(messages, { fields: [messages.parentId], references: [messages.id], relationName: "thread" }),
  replies: many(messages, { relationName: "thread" }),
  attachments: many(attachments),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  message: one(messages, { fields: [attachments.messageId], references: [messages.id] }),
}));

export type User = typeof users.$inferSelect;
export type Server = typeof servers.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
