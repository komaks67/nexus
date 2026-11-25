import type { AttachmentDTO, ChannelDTO, MessageDTO, ServerDTO, UserDTO, MemberRole } from "@nexus/shared";
import type { Attachment, Channel, Message, Server, User } from "../db/schema.js";

/** DBの行 → 画面に返す形（パスワードハッシュ等は絶対に含めない） */
export function toUserDTO(u: Pick<User, "id" | "username" | "displayName" | "avatarColor" | "createdAt">): UserDTO {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarColor: u.avatarColor,
    createdAt: u.createdAt.toISOString(),
  };
}

export function toServerDTO(s: Server, myRole: MemberRole): ServerDTO {
  return {
    id: s.id,
    name: s.name,
    ownerId: s.ownerId,
    inviteCode: s.inviteCode,
    myRole,
    createdAt: s.createdAt.toISOString(),
  };
}

export function toChannelDTO(c: Channel, lastReadMessageId: string | null = null): ChannelDTO {
  return {
    id: c.id,
    serverId: c.serverId,
    name: c.name,
    type: c.type,
    topic: c.topic,
    position: c.position,
    lastMessageId: c.lastMessageId,
    lastReadMessageId,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toAttachmentDTO(a: Attachment): AttachmentDTO {
  return { id: a.id, filename: a.filename, contentType: a.contentType, size: a.size };
}

export function toMessageDTO(
  m: Message & { author: User; attachments: Attachment[] },
  serverId: string,
): MessageDTO {
  return {
    id: m.id,
    channelId: m.channelId,
    serverId,
    author: toUserDTO(m.author),
    content: m.content,
    parentId: m.parentId,
    replyCount: m.replyCount,
    lastReplyAt: m.lastReplyAt ? m.lastReplyAt.toISOString() : null,
    attachments: m.attachments.filter((a) => a.status === "UPLOADED").map(toAttachmentDTO),
    createdAt: m.createdAt.toISOString(),
    ...(m.nonce ? { nonce: m.nonce } : {}),
  };
}
