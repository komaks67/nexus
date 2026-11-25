import type { ChannelDTO } from "@nexus/shared";
import { GridLayout, ParticipantTile, VideoTrack, useTracks, type TrackReference } from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  AudioLines,
  Headphones,
  HeadphoneOff,
  Maximize,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneCall,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import { useRef, useState } from "react";
import { SCREEN_QUALITIES, type ScreenQuality } from "../../lib/media";
import { useChat } from "../../stores/chat";
import { useLayout, type PaneId } from "../../stores/layout";
import { useVoice } from "../../stores/voice";
import { ErrorBanner, IconButton, Spinner, primaryButtonClass } from "../common/ui";
import { PaneHeader } from "../layout/PaneHeader";
import { VoiceChannelParticipants } from "./VoiceChannelParticipants";
import { useVoiceControls } from "./useVoiceControls";

/** 画面共有の大画面表示（複数人が共有中ならタブで切り替え） */
function ScreenStage({ shares }: { shares: TrackReference[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const focused = shares.find((s) => s.publication.trackSid === selected) ?? shares[0];
  if (!focused) return null;

  const fullscreen = () => {
    const el = boxRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => undefined);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {shares.length > 1 && (
        <div className="flex gap-1">
          {shares.map((s) => (
            <button
              key={s.publication.trackSid}
              onClick={() => setSelected(s.publication.trackSid)}
              className={`rounded px-2 py-1 text-xs ${s === focused ? "bg-accent text-white" : "bg-surface-3 text-fg-muted"}`}
            >
              {s.participant.name || s.participant.identity} の画面
            </button>
          ))}
        </div>
      )}
      <div ref={boxRef} className="group relative min-h-0 flex-1 overflow-hidden rounded-lg bg-black">
        <VideoTrack trackRef={focused} className="size-full object-contain" />
        <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
          {focused.participant.name || focused.participant.identity} の画面
          {focused.publication.dimensions && ` ・${focused.publication.dimensions.width}×${focused.publication.dimensions.height}`}
        </div>
        <button
          onClick={fullscreen}
          aria-label="全画面表示"
          title="全画面表示"
          className="absolute right-2 top-2 hidden rounded bg-black/60 p-1.5 text-white group-hover:block"
        >
          <Maximize className="size-4" />
        </button>
      </div>
    </div>
  );
}

function Stage() {
  const shares = useTracks([Track.Source.ScreenShare], { onlySubscribed: false }).filter(
    (t): t is TrackReference => !!t.publication,
  );
  const cameras = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });

  if (shares.length > 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <ScreenStage shares={shares} />
        <div className="flex h-28 shrink-0 gap-2 overflow-x-auto">
          {cameras.map((t) => (
            <div key={`${t.participant.identity}:${t.source}`} className="aspect-video h-full shrink-0">
              <ParticipantTile trackRef={t} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 p-3">
      <GridLayout tracks={cameras} style={{ height: "100%" }}>
        <ParticipantTile />
      </GridLayout>
    </div>
  );
}

function ControlBar({ paneId, channel }: { paneId: PaneId; channel: ChannelDTO }) {
  const c = useVoiceControls();
  const [quality, setQuality] = useState<ScreenQuality>(() => (localStorage.getItem("nexus.screenQuality") as ScreenQuality) || "1080p60");

  const openChatBeside = () => {
    const text = useChat.getState().channelsByServer[channel.serverId]?.find((x) => x.type === "TEXT");
    if (text) useLayout.getState().open(paneId === "main" ? "side" : "main", { kind: "channel", channelId: text.id });
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border bg-surface-1 px-3 py-2">
      <IconButton label={c.isMicrophoneEnabled ? "ミュート" : "ミュート解除"} danger={!c.isMicrophoneEnabled} disabled={c.busy === "mic"} onClick={() => void c.toggleMic()}>
        {c.isMicrophoneEnabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
      </IconButton>
      <IconButton label={c.deafened ? "スピーカーをオン" : "スピーカーをオフ"} danger={c.deafened} onClick={c.toggleDeafen}>
        {c.deafened ? <HeadphoneOff className="size-5" /> : <Headphones className="size-5" />}
      </IconButton>
      <IconButton label={c.noiseSuppression ? "ノイズ抑制: ON" : "ノイズ抑制: OFF"} active={c.noiseSuppression} disabled={c.busy === "ns"} onClick={() => void c.toggleNoiseSuppression()}>
        <AudioLines className="size-5" />
      </IconButton>
      <IconButton label={c.isCameraEnabled ? "カメラをオフ" : "カメラをオン"} active={c.isCameraEnabled} disabled={c.busy === "camera"} onClick={() => void c.toggleCamera()}>
        {c.isCameraEnabled ? <Video className="size-5" /> : <VideoOff className="size-5" />}
      </IconButton>

      <div className="flex items-center gap-1 rounded-md bg-surface-3 pl-2">
        <select
          value={quality}
          disabled={c.isScreenShareEnabled}
          onChange={(e) => {
            const q = e.target.value as ScreenQuality;
            setQuality(q);
            localStorage.setItem("nexus.screenQuality", q);
          }}
          aria-label="画面共有の画質"
          className="bg-transparent text-xs text-fg-muted outline-none disabled:opacity-50"
        >
          {(Object.keys(SCREEN_QUALITIES) as ScreenQuality[]).map((k) => (
            <option key={k} value={k}>
              {SCREEN_QUALITIES[k].label}
            </option>
          ))}
        </select>
        <IconButton
          label={c.isScreenShareEnabled ? "画面共有を停止" : "画面共有を開始（システム音声つき）"}
          active={c.isScreenShareEnabled}
          disabled={c.busy === "screen"}
          onClick={() => void c.toggleScreen(quality)}
        >
          {c.busy === "screen" ? <Spinner className="size-5" /> : <MonitorUp className="size-5" />}
        </IconButton>
      </div>

      <IconButton label="テキストチャットを横に開く" onClick={openChatBeside}>
        <MessageSquare className="size-5" />
      </IconButton>
      <IconButton label="切断" danger onClick={() => useVoice.getState().leave()}>
        <PhoneOff className="size-5" />
      </IconButton>
    </div>
  );
}

export function VoiceView({ paneId, channel }: { paneId: PaneId; channel: ChannelDTO }) {
  const voiceChannelId = useVoice((s) => s.channelId);
  const status = useVoice((s) => s.status);
  const error = useVoice((s) => s.error);
  const warning = useVoice((s) => s.warning);
  const joinedHere = voiceChannelId === channel.id;
  const live = joinedHere && (status === "connected" || status === "reconnecting");

  return (
    <>
      <PaneHeader paneId={paneId} icon={<Volume2 className="size-5" />} title={channel.name} subtitle={channel.topic} />
      {joinedHere && error && <ErrorBanner message={error} onRetry={() => void useVoice.getState().join(channel.id)} />}
      {joinedHere && !error && warning && (
        <div role="status" className="mx-3 mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-amber-200">
          {warning}
        </div>
      )}
      {status === "reconnecting" && joinedHere && (
        <div className="mx-3 mt-3 flex items-center gap-2 text-sm text-warning">
          <Spinner /> 接続が不安定です。再接続しています…
        </div>
      )}

      {live ? (
        <>
          <Stage />
          <ControlBar paneId={paneId} channel={channel} />
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <div className="flex size-20 items-center justify-center rounded-full bg-surface-3">
            <Volume2 className="size-10 text-fg-muted" />
          </div>
          <h3 className="text-xl font-bold">{channel.name}</h3>
          <div className="w-56">
            <VoiceChannelParticipants channelId={channel.id} />
          </div>
          {joinedHere && (status === "fetching" || status === "connecting") ? (
            <div className="flex items-center gap-2 text-sm text-fg-muted">
              <Spinner /> 接続しています…
            </div>
          ) : (
            <button className={primaryButtonClass} onClick={() => void useVoice.getState().join(channel.id)}>
              <PhoneCall className="size-4" /> ボイスチャンネルに参加
            </button>
          )}
          <p className="max-w-sm text-center text-xs text-fg-subtle">
            参加中も他のチャンネルを自由に見られます。画面共有は最大 4K / 60fps に対応しています。
          </p>
        </div>
      )}
    </>
  );
}
