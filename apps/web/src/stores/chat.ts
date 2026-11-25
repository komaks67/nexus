import type {
  ChannelDTO,
  CreateChannelInput,
  MemberDTO,
  MessageDTO,
  MessagePage,
  PresenceStatus,
  ServerDTO,
} from "@nexus/shared";
import { LIMITS } from "@nexus/shared";
import { create } from "zustand";
import { api, errorMessage } from "../lib/api";
import { newNonce } from "../lib/format";
import { getSocket } from "../lib/socket";
import { useAuth } from "./auth";

/** 画面用のメッセージ（送信中・失敗の状態を追加） */
export interface ClientMessage extends MessageDTO {
  localStatus?: "sending" | "failed";
  localError?: string;
}

interface ChannelMessages {
  items: ClientMessage[];
  hasMore: boolean;
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
  loaded: boolean;
}

interface ThreadState {
  root: ClientMessage | null;
  replies: ClientMessage[];
  loading: boolean;
  error: string | null;
}

interface ChatState {
  servers: ServerDTO[];
  serversLoaded: boolean;
  serversError: string | null;
  activeServerId: string | null;
  channelsByServer: Record<string, ChannelDTO[]>;
  membersByServer: Record<string, MemberDTO[]>;
  presence: Record<string, PresenceStatus>;
  messages: Record<string, ChannelMessages>;
  threads: Record<string, ThreadState>;
  typing: Record<string, Record<string, { name: string; until: number }>>;
  /** チャンネルを開いた時点の既読位置（AI未読要約に使う） */
  readSnapshot: Record<string, string | null>;

  loadServers: () => Promise<void>;
  selectServer: (serverId: string) => Promise<void>;
  createServer: (name: string) => Promise<ServerDTO>;
  joinServer: (inviteCode: string) => Promise<ServerDTO>;
  loadChannels: (serverId: string) => Promise<void>;
  createChannel: (serverId: string, input: CreateChannelInput) => Promise<ChannelDTO>;
  loadMembers: (serverId: string) => Promise<void>;
  findChannel: (channelId: string) => ChannelDTO | undefined;

  loadMessages: (channelId: string, force?: boolean) => Promise<void>;
  loadOlder: (channelId: string) => Promise<boolean>;
  loadThread: (channelId: string, rootId: string) => Promise<void>;
  sendMessage: (input: {
    channelId: string;
    content: string;
    parentId?: string | null;
    attachmentIds?: string[];
  }) => Promise<void>;
  retrySend: (channelId: string, localId: string, parentId: string | null) => Promise<void>;
  markRead: (channelId: string) => void;
  takeReadSnapshot: (channelId: string) => void;

  /* Socket.io から届いたイベントの反映 */
  onMessage: (m: MessageDTO) => void;
  onThreadUpdated: (p: { channelId: string; rootId: string; replyCount: number; lastReplyAt: string }) => void;
  onTyping: (p: { channelId: string; userId: string; displayName: string }) => void;
  onPresence: (p: { userId: string; status: PresenceStatus }) => void;
  onChannelCreated: (c: ChannelDTO) => void;
  onMemberJoined: (p: { serverId: string; member: MemberDTO }) => void;
  onServerJoined: (s: ServerDTO) => void;
  reset: () => void;
}

const emptyChannel = (): ChannelMessages => ({
  items: [],
  hasMore: false,
  loading: false,
  loadingOlder: false,
  error: null,
  loaded: false,
});

const initial = {
  servers: [],
  serversLoaded: false,
  serversError: null,
  activeServerId: null,
  channelsByServer: {},
  membersByServer: {},
  presence: {},
  messages: {},
  threads: {},
  typing: {},
  readSnapshot: {},
};

/** 同じIDやnonceのメッセージを重複させずに入れる */
function upsert(list: ClientMessage[], m: ClientMessage): ClientMessage[] {
  const idx = list.findIndex((x) => x.id === m.id || (m.nonce && x.nonce === m.nonce && x.localStatus));
  if (idx >= 0) {
    const next = list.slice();
    next[idx] = m;
    return next;
  }
  // 時系列順（UUID v7 = 時刻順）を保ったまま追加。送信中のものは常に末尾
  const next = [...list, m];
  return next.sort((a, b) => {
    if (a.localStatus && !b.localStatus) return 1;
    if (!a.localStatus && b.localStatus) return -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function emitSend(payload: {
  channelId: string;
  content: string;
  parentId: string | null;
  attachmentIds: string[];
  nonce: string;
}): Promise<MessageDTO> {
  const socket = getSocket();
  if (!socket?.connected) {
    // WebSocket が切れている時は REST で送る
    return api<{ message: MessageDTO }>("/api/messages", { method: "POST", body: payload }).then((r) => r.message);
  }
  return socket
    .timeout(15_000)
    .emitWithAck("message:send", payload)
    .then((res) => {
      if (!res.ok) throw new Error(res.error);
      return res.data;
    });
}

export const useChat = create<ChatState>((set, get) => {
  const patchChannel = (channelId: string, patch: Partial<ChannelMessages>) =>
    set((s) => ({ messages: { ...s.messages, [channelId]: { ...(s.messages[channelId] ?? emptyChannel()), ...patch } } }));

  const updateChannelMeta = (channelId: string, patch: Partial<ChannelDTO>) =>
    set((s) => {
      const out: Record<string, ChannelDTO[]> = {};
      for (const [sid, list] of Object.entries(s.channelsByServer)) {
        out[sid] = list.map((c) => (c.id === channelId ? { ...c, ...patch } : c));
      }
      return { channelsByServer: out };
    });

  /** メッセージを該当リスト（チャンネル or スレッド）に入れる */
  const placeMessage = (m: ClientMessage) => {
    if (m.parentId) {
      const t = get().threads[m.parentId];
      if (t) {
        set((s) => ({
          threads: { ...s.threads, [m.parentId!]: { ...t, replies: upsert(t.replies, m) } },
        }));
      }
    } else {
      const ch = get().messages[m.channelId];
      if (ch?.loaded || m.localStatus) {
        patchChannel(m.channelId, { items: upsert(ch?.items ?? [], m) });
      }
    }
  };

  return {
    ...initial,

    findChannel: (channelId) => {
      for (const list of Object.values(get().channelsByServer)) {
        const c = list.find((x) => x.id === channelId);
        if (c) return c;
      }
      return undefined;
    },

    /* ---------------- サーバー ---------------- */
    loadServers: async () => {
      try {
        const { servers } = await api<{ servers: ServerDTO[] }>("/api/servers");
        set({ servers, serversLoaded: true, serversError: null });
        const active = get().activeServerId;
        const first = servers[0];
        if ((!active || !servers.some((s) => s.id === active)) && first) await get().selectServer(first.id);
      } catch (err) {
        set({ serversError: errorMessage(err), serversLoaded: true });
      }
    },

    selectServer: async (serverId) => {
      set({ activeServerId: serverId });
      localStorage.setItem("nexus.activeServer", serverId);
      await Promise.all([
        get().channelsByServer[serverId] ? Promise.resolve() : get().loadChannels(serverId),
        get().loadMembers(serverId),
      ]);
    },

    createServer: async (name) => {
      const { server } = await api<{ server: ServerDTO }>("/api/servers", { method: "POST", body: { name } });
      set((s) => ({ servers: s.servers.some((x) => x.id === server.id) ? s.servers : [...s.servers, server] }));
      await get().selectServer(server.id);
      return server;
    },

    joinServer: async (inviteCode) => {
      const { server } = await api<{ server: ServerDTO }>("/api/servers/join", {
        method: "POST",
        body: { inviteCode },
      });
      set((s) => ({ servers: s.servers.some((x) => x.id === server.id) ? s.servers : [...s.servers, server] }));
      await get().selectServer(server.id);
      return server;
    },

    loadChannels: async (serverId) => {
      const { channels } = await api<{ channels: ChannelDTO[] }>(`/api/servers/${serverId}/channels`);
      set((s) => ({ channelsByServer: { ...s.channelsByServer, [serverId]: channels } }));
    },

    createChannel: async (serverId, input) => {
      const { channel } = await api<{ channel: ChannelDTO }>(`/api/servers/${serverId}/channels`, {
        method: "POST",
        body: input,
      });
      get().onChannelCreated(channel);
      return channel;
    },

    loadMembers: async (serverId) => {
      try {
        const { members } = await api<{ members: MemberDTO[] }>(`/api/servers/${serverId}/members`);
        set((s) => {
          const presence = { ...s.presence };
          for (const m of members) presence[m.user.id] = m.status;
          return { membersByServer: { ...s.membersByServer, [serverId]: members }, presence };
        });
      } catch (err) {
        console.warn("メンバー取得に失敗:", errorMessage(err));
      }
    },

    /* ---------------- メッセージ ---------------- */
    loadMessages: async (channelId, force = false) => {
      const cur = get().messages[channelId];
      if (cur?.loading || (cur?.loaded && !force)) return;
      patchChannel(channelId, { loading: true, error: null });
      try {
        const page = await api<MessagePage>(`/api/channels/${channelId}/messages`, {
          query: { limit: LIMITS.messagePageSize },
        });
        // 送信中のメッセージは残す
        const pending = (get().messages[channelId]?.items ?? []).filter((m) => m.localStatus);
        let items: ClientMessage[] = page.messages;
        for (const p of pending) items = upsert(items, p);
        patchChannel(channelId, { items, hasMore: page.hasMore, loading: false, loaded: true });
      } catch (err) {
        patchChannel(channelId, { loading: false, error: errorMessage(err) });
      }
    },

    loadOlder: async (channelId) => {
      const cur = get().messages[channelId];
      const oldest = cur?.items.find((m) => !m.localStatus);
      if (!cur || !cur.hasMore || cur.loadingOlder || !oldest) return false;
      patchChannel(channelId, { loadingOlder: true });
      try {
        const page = await api<MessagePage>(`/api/channels/${channelId}/messages`, {
          query: { before: oldest.id, limit: LIMITS.messagePageSize },
        });
        const latest = get().messages[channelId] ?? emptyChannel();
        patchChannel(channelId, {
          items: [...page.messages, ...latest.items.filter((m) => !page.messages.some((p) => p.id === m.id))],
          hasMore: page.hasMore,
          loadingOlder: false,
        });
        return page.messages.length > 0;
      } catch (err) {
        patchChannel(channelId, { loadingOlder: false, error: errorMessage(err) });
        return false;
      }
    },

    loadThread: async (channelId, rootId) => {
      set((s) => ({
        threads: {
          ...s.threads,
          [rootId]: { root: s.threads[rootId]?.root ?? null, replies: s.threads[rootId]?.replies ?? [], loading: true, error: null },
        },
      }));
      try {
        const res = await api<{ root: MessageDTO; replies: MessageDTO[] }>(
          `/api/channels/${channelId}/threads/${rootId}`,
        );
        set((s) => {
          const pending = (s.threads[rootId]?.replies ?? []).filter((m) => m.localStatus);
          let replies: ClientMessage[] = res.replies;
          for (const p of pending) replies = upsert(replies, p);
          return { threads: { ...s.threads, [rootId]: { root: res.root, replies, loading: false, error: null } } };
        });
      } catch (err) {
        set((s) => ({
          threads: {
            ...s.threads,
            [rootId]: { root: null, replies: [], loading: false, error: errorMessage(err) },
          },
        }));
      }
    },

    sendMessage: async ({ channelId, content, parentId = null, attachmentIds = [] }) => {
      const me = useAuth.getState().user;
      if (!me) return;
      const channel = get().findChannel(channelId);
      const nonce = newNonce();
      const local: ClientMessage = {
        id: `local:${nonce}`,
        channelId,
        serverId: channel?.serverId ?? "",
        author: me,
        content,
        parentId,
        replyCount: 0,
        lastReplyAt: null,
        attachments: [],
        createdAt: new Date().toISOString(),
        nonce,
        localStatus: "sending",
      };
      // 送信完了を待たずに画面へ表示（体感速度を上げる「楽観的更新」）
      placeMessage(local);
      try {
        const saved = await emitSend({ channelId, content, parentId, attachmentIds, nonce });
        get().onMessage(saved);
      } catch (err) {
        failedAttachments.set(local.id, attachmentIds);
        placeMessage({ ...local, localStatus: "failed", localError: errorMessage(err) });
      }
    },

    retrySend: async (channelId, localId, parentId) => {
      const list = parentId ? get().threads[parentId]?.replies : get().messages[channelId]?.items;
      const msg = list?.find((m) => m.id === localId);
      if (!msg?.nonce) return;
      placeMessage({ ...msg, localStatus: "sending", localError: undefined });
      try {
        const saved = await emitSend({
          channelId,
          content: msg.content,
          parentId,
          attachmentIds: failedAttachments.get(localId) ?? [],
          nonce: msg.nonce, // 同じ nonce で送るので、実は届いていた場合も二重にならない
        });
        failedAttachments.delete(localId);
        get().onMessage(saved);
      } catch (err) {
        placeMessage({ ...msg, localStatus: "failed", localError: errorMessage(err) });
      }
    },

    takeReadSnapshot: (channelId) => {
      if (channelId in get().readSnapshot) return;
      const c = get().findChannel(channelId);
      set((s) => ({ readSnapshot: { ...s.readSnapshot, [channelId]: c?.lastReadMessageId ?? null } }));
    },

    markRead: (channelId) => {
      const c = get().findChannel(channelId);
      if (!c?.lastMessageId || c.lastReadMessageId === c.lastMessageId) return;
      updateChannelMeta(channelId, { lastReadMessageId: c.lastMessageId });
      getSocket()?.emit("channel:read", { channelId, messageId: c.lastMessageId });
    },

    /* ---------------- Socket.io イベント ---------------- */
    onMessage: (m) => {
      placeMessage(m);
      // 入力中表示を消す
      set((s) => {
        const t = s.typing[m.channelId];
        if (!t?.[m.author.id]) return {};
        const { [m.author.id]: _removed, ...rest } = t;
        return { typing: { ...s.typing, [m.channelId]: rest } };
      });
      if (!m.parentId) {
        const me = useAuth.getState().user;
        const c = get().findChannel(m.channelId);
        if (c && (!c.lastMessageId || c.lastMessageId < m.id)) {
          updateChannelMeta(m.channelId, {
            lastMessageId: m.id,
            ...(me?.id === m.author.id ? { lastReadMessageId: m.id } : {}),
          });
        }
      }
    },

    onThreadUpdated: ({ channelId, rootId, replyCount, lastReplyAt }) => {
      set((s) => {
        const ch = s.messages[channelId];
        const t = s.threads[rootId];
        return {
          messages: ch
            ? {
                ...s.messages,
                [channelId]: {
                  ...ch,
                  items: ch.items.map((m) => (m.id === rootId ? { ...m, replyCount, lastReplyAt } : m)),
                },
              }
            : s.messages,
          threads:
            t?.root ? { ...s.threads, [rootId]: { ...t, root: { ...t.root, replyCount, lastReplyAt } } } : s.threads,
        };
      });
    },

    onTyping: ({ channelId, userId, displayName }) => {
      set((s) => ({
        typing: {
          ...s.typing,
          [channelId]: { ...(s.typing[channelId] ?? {}), [userId]: { name: displayName, until: Date.now() + 6000 } },
        },
      }));
    },

    onPresence: ({ userId, status }) => {
      set((s) => {
        const membersByServer: Record<string, MemberDTO[]> = {};
        for (const [sid, list] of Object.entries(s.membersByServer)) {
          membersByServer[sid] = list.map((m) => (m.user.id === userId ? { ...m, status } : m));
        }
        return { presence: { ...s.presence, [userId]: status }, membersByServer };
      });
    },

    onChannelCreated: (c) => {
      set((s) => {
        const list = s.channelsByServer[c.serverId];
        if (!list || list.some((x) => x.id === c.id)) return {};
        return {
          channelsByServer: {
            ...s.channelsByServer,
            [c.serverId]: [...list, c].sort((a, b) => a.position - b.position),
          },
        };
      });
    },

    onMemberJoined: ({ serverId, member }) => {
      set((s) => {
        const list = s.membersByServer[serverId];
        if (!list || list.some((m) => m.user.id === member.user.id)) return {};
        return {
          membersByServer: { ...s.membersByServer, [serverId]: [...list, member] },
          presence: { ...s.presence, [member.user.id]: member.status },
        };
      });
    },

    onServerJoined: (server) => {
      set((s) => ({ servers: s.servers.some((x) => x.id === server.id) ? s.servers : [...s.servers, server] }));
    },

    reset: () => {
      failedAttachments.clear();
      set(initial);
    },
  };
});

/** 送信に失敗したメッセージの添付ファイルID（再送用） */
const failedAttachments = new Map<string, string[]>();
