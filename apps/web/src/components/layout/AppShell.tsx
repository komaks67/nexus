import { useCallback, useEffect, useState } from "react";
import { useModHotkey } from "../../hooks/useHotkey";
import { useSocketEvents } from "../../hooks/useSocketEvents";
import { ensureNotificationPermission } from "../../lib/notify";
import { useChat } from "../../stores/chat";
import { useLayout } from "../../stores/layout";
import { ErrorBanner, Spinner } from "../common/ui";
import { SearchModal } from "../search/SearchModal";
import { VoiceRoomProvider } from "../voice/VoiceRoomProvider";
import { ChannelSidebar } from "./ChannelSidebar";
import { ServerRail } from "./ServerRail";
import { SplitView } from "./SplitView";

/** ログイン後の画面全体: [サーバー一覧] [チャンネル一覧] [メイン | サブパネル] */
export function AppShell() {
  const [connected, setConnected] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const serversLoaded = useChat((s) => s.serversLoaded);
  const serversError = useChat((s) => s.serversError);
  const activeServerId = useChat((s) => s.activeServerId);
  const channels = useChat((s) => (s.activeServerId ? s.channelsByServer[s.activeServerId] : undefined));

  useSocketEvents(useCallback((c: boolean) => setConnected(c), []));
  useModHotkey("k", useCallback(() => setSearchOpen((v) => !v), []));

  useEffect(() => {
    const saved = localStorage.getItem("nexus.activeServer");
    if (saved) useChat.setState({ activeServerId: saved });
    void useChat.getState().loadServers();
    // 通知の許可は最初の操作のときに確認する（いきなり聞くとブロックされやすい）
    const ask = () => void ensureNotificationPermission();
    window.addEventListener("pointerdown", ask, { once: true });
    return () => window.removeEventListener("pointerdown", ask);
  }, []);

  // サーバーを切り替えたら、そのサーバーの最初のテキストチャンネルを開く
  useEffect(() => {
    if (!activeServerId || !channels) return;
    const { main } = useLayout.getState();
    const mainInServer = main && channels.some((c) => c.id === main.channelId);
    if (!mainInServer) {
      const first = channels.find((c) => c.type === "TEXT") ?? channels[0];
      if (first) useLayout.getState().open("main", { kind: "channel", channelId: first.id });
    }
  }, [activeServerId, channels]);

  if (!serversLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <VoiceRoomProvider>
      <div className="flex h-full">
        <ServerRail onOpenSearch={() => setSearchOpen(true)} />
        <ChannelSidebar connected={connected} />
        <main className="flex min-w-0 flex-1 flex-col">
          {serversError && <ErrorBanner message={serversError} onRetry={() => void useChat.getState().loadServers()} />}
          {!connected && (
            <div className="bg-warning/15 px-4 py-1 text-center text-xs text-amber-200">
              リアルタイム接続が切れています。再接続中…（送信は自動で別経路に切り替わります）
            </div>
          )}
          <SplitView />
        </main>
      </div>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </VoiceRoomProvider>
  );
}
