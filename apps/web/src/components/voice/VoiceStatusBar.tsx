import { AudioLines, Headphones, HeadphoneOff, Mic, MicOff, MonitorUp, PhoneOff, Signal } from "lucide-react";
import { useChat } from "../../stores/chat";
import { useLayout } from "../../stores/layout";
import { useVoice } from "../../stores/voice";
import { IconButton, Spinner } from "../common/ui";
import { useVoiceControls } from "./useVoiceControls";

const STATUS_TEXT = {
  idle: "",
  fetching: "接続準備中…",
  connecting: "接続中…",
  connected: "通話中",
  reconnecting: "再接続中…",
  error: "エラー",
} as const;

/** サイドバー下部の通話コントロール（どの画面を見ていても操作できる） */
export function VoiceStatusBar() {
  const channelId = useVoice((s) => s.channelId);
  const status = useVoice((s) => s.status);
  const error = useVoice((s) => s.error);
  const warning = useVoice((s) => s.warning);
  const channel = useChat((s) => (channelId ? s.findChannel(channelId) : undefined));
  const c = useVoiceControls();

  if (!channelId) return null;
  const ok = status === "connected";

  return (
    <div className="border-t border-border bg-surface-0/60 px-2 py-2">
      <div className="flex items-center gap-2">
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => useLayout.getState().open("main", { kind: "channel", channelId })}
          title="通話画面を開く"
        >
          <div className={`flex items-center gap-1 text-xs font-semibold ${ok ? "text-success" : status === "error" ? "text-red-300" : "text-warning"}`}>
            {ok ? <Signal className="size-3.5" /> : status !== "error" && <Spinner className="size-3" />}
            {STATUS_TEXT[status]}
          </div>
          <div className="truncate text-xs text-fg-muted">{channel?.name ?? "ボイス"}</div>
        </button>
        <IconButton label="切断" danger onClick={() => useVoice.getState().leave()}>
          <PhoneOff className="size-4" />
        </IconButton>
      </div>
      {(error || warning) && (
        <p role="alert" className="mt-1 text-[11px] leading-snug text-warning">
          {error ?? warning}
        </p>
      )}
      {status === "error" && (
        <button onClick={() => void useVoice.getState().join(channelId)} className="mt-1 text-[11px] text-accent hover:underline">
          再接続する
        </button>
      )}
      {ok && (
        <div className="mt-1.5 flex justify-around">
          <IconButton label={c.isMicrophoneEnabled ? "ミュート" : "ミュート解除"} danger={!c.isMicrophoneEnabled} disabled={c.busy === "mic"} onClick={() => void c.toggleMic()}>
            {c.isMicrophoneEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
          </IconButton>
          <IconButton label={c.deafened ? "スピーカーをオン" : "スピーカーをオフ"} danger={c.deafened} onClick={c.toggleDeafen}>
            {c.deafened ? <HeadphoneOff className="size-4" /> : <Headphones className="size-4" />}
          </IconButton>
          <IconButton label={c.noiseSuppression ? "ノイズ抑制: ON" : "ノイズ抑制: OFF"} active={c.noiseSuppression} disabled={c.busy === "ns"} onClick={() => void c.toggleNoiseSuppression()}>
            <AudioLines className="size-4" />
          </IconButton>
          <IconButton label={c.isScreenShareEnabled ? "画面共有を停止" : "画面共有（1080p60）"} active={c.isScreenShareEnabled} disabled={c.busy === "screen"} onClick={() => void c.toggleScreen("1080p60")}>
            <MonitorUp className="size-4" />
          </IconButton>
        </div>
      )}
    </div>
  );
}
