import { useEffect } from "react";
import { getSocket } from "../lib/socket";
import { notify } from "../lib/notify";
import { useAuth } from "../stores/auth";
import { useChat } from "../stores/chat";
import { useLayout } from "../stores/layout";

/** 画面に表示中のチャンネルか */
function isVisible(channelId: string): boolean {
  const { main, side } = useLayout.getState();
  return (
    document.visibilityState === "visible" &&
    document.hasFocus() &&
    (main?.channelId === channelId || side?.channelId === channelId)
  );
}

/**
 * Socket.io のイベントを受け取り、ストア（画面の状態）に反映する。
 * アプリ全体で1回だけ使う。
 */
export function useSocketEvents(onConnectionChange: (connected: boolean) => void): void {
  const token = useAuth((s) => s.token);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const chat = useChat.getState();
    const me = useAuth.getState().user;

    socket.on("connect", () => {
      onConnectionChange(true);
      // 切断中に届かなかったメッセージを取り直す（自動復旧できなかった場合）
      if (!socket.recovered) {
        const state = useChat.getState();
        for (const [channelId, ch] of Object.entries(state.messages)) {
          if (ch.loaded) void state.loadMessages(channelId, true);
        }
        for (const sid of Object.keys(state.channelsByServer)) void state.loadChannels(sid);
        if (state.activeServerId) void state.loadMembers(state.activeServerId);
      }
    });
    socket.on("disconnect", () => onConnectionChange(false));
    socket.on("connect_error", (err) => {
      onConnectionChange(false);
      if (err.message === "UNAUTHORIZED") useAuth.getState().logout();
    });

    socket.on("message:new", (m) => {
      useChat.getState().onMessage(m);
      if (m.author.id === me?.id) return;

      // 自分宛てのメンションか、自分が始めたスレッドへの返信なら通知
      const mentioned = me && new RegExp(`@(${me.username}|everyone)\\b`, "i").test(m.content);
      const root = m.parentId ? useChat.getState().threads[m.parentId]?.root : null;
      const replyToMe = root?.author.id === me?.id;
      if ((mentioned || replyToMe) && !isVisible(m.channelId)) {
        const channel = useChat.getState().findChannel(m.channelId);
        void notify(`${m.author.displayName}${channel ? ` (#${channel.name})` : ""}`, m.content || "📎 ファイル", () =>
          useLayout.getState().open("main", { kind: "channel", channelId: m.channelId }),
        );
      }
      if (!m.parentId && isVisible(m.channelId)) useChat.getState().markRead(m.channelId);
    });

    socket.on("thread:updated", chat.onThreadUpdated);
    socket.on("typing", chat.onTyping);
    socket.on("presence", chat.onPresence);
    socket.on("channel:created", chat.onChannelCreated);
    socket.on("member:joined", chat.onMemberJoined);
    socket.on("server:joined", chat.onServerJoined);
    socket.on("voice:updated", ({ channelId }) => {
      window.dispatchEvent(new CustomEvent("nexus:voice-updated", { detail: channelId }));
    });

    if (socket.connected) onConnectionChange(true);

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("connect_error");
      socket.off("message:new");
      socket.off("thread:updated");
      socket.off("typing");
      socket.off("presence");
      socket.off("channel:created");
      socket.off("member:joined");
      socket.off("server:joined");
      socket.off("voice:updated");
    };
  }, [token, onConnectionChange]);
}
