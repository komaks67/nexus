import type { ChannelDTO } from "@nexus/shared";
import { BookOpen, Check, ChevronDown, Columns2, Copy, Hash, LogOut, Plus, Volume2, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../stores/auth";
import { useChat } from "../../stores/chat";
import { useLayout } from "../../stores/layout";
import { useVoice } from "../../stores/voice";
import { Avatar, IconButton } from "../common/ui";
import { CreateChannelDialog } from "../dialogs/CreateChannelDialog";
import { VoiceChannelParticipants } from "../voice/VoiceChannelParticipants";
import { VoiceStatusBar } from "../voice/VoiceStatusBar";

const ICONS = { TEXT: Hash, VOICE: Volume2, KNOWLEDGE: BookOpen } as const;

function ChannelRow({ channel }: { channel: ChannelDTO }) {
  const main = useLayout((s) => s.main);
  const side = useLayout((s) => s.side);
  const open = useLayout((s) => s.open);
  const voiceChannelId = useVoice((s) => s.channelId);
  const Icon = ICONS[channel.type];
  const isOpen = main?.channelId === channel.id || side?.channelId === channel.id;
  const unread =
    channel.type !== "VOICE" && !!channel.lastMessageId && channel.lastMessageId !== channel.lastReadMessageId;

  const onClick = () => {
    if (channel.type === "VOICE") {
      void useVoice.getState().join(channel.id);
      open("main", { kind: "channel", channelId: channel.id });
      // 画面共有を見ながらチャットできるよう、サブパネルにテキストチャンネルを自動で開く
      if (!useLayout.getState().side) {
        const text = useChat
          .getState()
          .channelsByServer[channel.serverId]?.find((c) => c.type === "TEXT");
        if (text) useLayout.getState().open("side", { kind: "channel", channelId: text.id });
        useLayout.getState().focus("main");
      }
      return;
    }
    open("main", { kind: "channel", channelId: channel.id });
  };

  return (
    <li>
      <div
        className={`group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm ${
          isOpen ? "bg-surface-4 text-fg" : unread ? "text-fg" : "text-fg-muted hover:bg-surface-3 hover:text-fg"
        }`}
      >
        <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <Icon className={`size-4 shrink-0 ${voiceChannelId === channel.id ? "text-success" : ""}`} />
          <span className={`truncate ${unread ? "font-semibold" : ""}`}>{channel.name}</span>
          {unread && <span className="ml-auto size-2 shrink-0 rounded-full bg-fg" aria-label="未読あり" />}
        </button>
        {channel.type !== "VOICE" && (
          <button
            onClick={() => open("side", { kind: "channel", channelId: channel.id })}
            title="サブパネルで開く（2画面表示）"
            aria-label={`${channel.name} をサブパネルで開く`}
            className="hidden shrink-0 rounded p-0.5 text-fg-muted hover:bg-surface-4 hover:text-fg group-hover:block"
          >
            <Columns2 className="size-3.5" />
          </button>
        )}
      </div>
      {channel.type === "VOICE" && <VoiceChannelParticipants channelId={channel.id} />}
    </li>
  );
}

export function ChannelSidebar({ connected }: { connected: boolean }) {
  const activeServerId = useChat((s) => s.activeServerId);
  const server = useChat((s) => s.servers.find((x) => x.id === s.activeServerId));
  const channels = useChat((s) => (s.activeServerId ? s.channelsByServer[s.activeServerId] : undefined));
  const members = useChat((s) => (s.activeServerId ? s.membersByServer[s.activeServerId] : undefined));
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [membersOpen, setMembersOpen] = useState(true);

  const canManage = server && server.myRole !== "MEMBER";
  const textLike = channels?.filter((c) => c.type !== "VOICE") ?? [];
  const voice = channels?.filter((c) => c.type === "VOICE") ?? [];
  const online = members?.filter((m) => m.status === "online") ?? [];
  const offline = members?.filter((m) => m.status !== "online") ?? [];

  const copyInvite = async () => {
    if (!server) return;
    try {
      await navigator.clipboard.writeText(server.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("招待コード", server.inviteCode);
    }
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-surface-1">
      <header className="flex h-12 items-center gap-2 border-b border-border px-3">
        <h2 className="flex-1 truncate font-semibold">{server?.name ?? "サーバー未選択"}</h2>
        {server && (
          <button
            onClick={() => void copyInvite()}
            title="招待コードをコピー"
            className="flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-xs text-fg-muted hover:text-fg"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            招待
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {!server && <p className="px-2 text-sm text-fg-muted">左の「＋」からサーバーを作成・参加してください</p>}
        {server && !channels && <p className="px-2 text-sm text-fg-muted">読み込み中…</p>}

        {[
          { title: "テキスト / ナレッジ", list: textLike },
          { title: "ボイス", list: voice },
        ].map(({ title, list }) => (
          <section key={title} className="mb-4">
            <div className="mb-1 flex items-center px-2 text-xs font-semibold uppercase text-fg-subtle">
              <span className="flex-1">{title}</span>
              {canManage && (
                <button onClick={() => setCreating(true)} title="チャンネルを作成" aria-label="チャンネルを作成" className="hover:text-fg">
                  <Plus className="size-3.5" />
                </button>
              )}
            </div>
            <ul className="space-y-0.5">
              {list.map((c) => (
                <ChannelRow key={c.id} channel={c} />
              ))}
            </ul>
          </section>
        ))}

        {members && (
          <section>
            <button
              onClick={() => setMembersOpen(!membersOpen)}
              className="mb-1 flex w-full items-center gap-1 px-2 text-xs font-semibold uppercase text-fg-subtle hover:text-fg"
            >
              <ChevronDown className={`size-3 transition-transform ${membersOpen ? "" : "-rotate-90"}`} />
              メンバー — {online.length}/{members.length} オンライン
            </button>
            {membersOpen && (
              <ul className="space-y-0.5">
                {[...online, ...offline].map((m) => (
                  <li
                    key={m.user.id}
                    className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${m.status === "online" ? "" : "opacity-50"}`}
                  >
                    <Avatar user={m.user} size={24} status={m.status} />
                    <span className="truncate">{m.user.displayName}</span>
                    {m.role !== "MEMBER" && (
                      <span className="ml-auto text-[10px] text-warning">{m.role === "OWNER" ? "オーナー" : "管理者"}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <VoiceStatusBar />

      <footer className="flex items-center gap-2 border-t border-border bg-surface-0/60 px-2 py-2">
        {user && <Avatar user={user} size={32} status={connected ? "online" : "offline"} />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{user?.displayName}</div>
          <div className={`flex items-center gap-1 text-xs ${connected ? "text-fg-subtle" : "text-warning"}`}>
            {connected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
            {connected ? `@${user?.username}` : "再接続中…"}
          </div>
        </div>
        <IconButton label="ログアウト" onClick={logout}>
          <LogOut className="size-4" />
        </IconButton>
      </footer>

      {creating && activeServerId && <CreateChannelDialog serverId={activeServerId} onClose={() => setCreating(false)} />}
    </aside>
  );
}
