import type { VoiceParticipantDTO } from "@nexus/shared";
import { useIsSpeaking, useParticipants } from "@livekit/components-react";
import type { Participant } from "livekit-client";
import { MicOff, MonitorUp } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useVoice } from "../../stores/voice";

function LiveRow({ p }: { p: Participant }) {
  const speaking = useIsSpeaking(p);
  return (
    <li className="flex items-center gap-1.5 py-0.5 text-xs text-fg-muted">
      <span className={`size-5 rounded-full bg-surface-4 ring-2 ${speaking ? "ring-success" : "ring-transparent"}`} />
      <span className="truncate">{p.name || p.identity}</span>
      {!p.isMicrophoneEnabled && <MicOff className="size-3 shrink-0 text-red-400" />}
      {p.isScreenShareEnabled && <MonitorUp className="size-3 shrink-0 text-accent" />}
    </li>
  );
}

/** 自分が参加中の部屋は LiveKit から直接（話している人が光る） */
function LiveParticipants() {
  const participants = useParticipants();
  return (
    <ul className="ml-7 border-l border-border pl-2">
      {participants.map((p) => (
        <LiveRow key={p.identity} p={p} />
      ))}
    </ul>
  );
}

/** 参加していない部屋はサーバー経由で一覧を取得 */
function RemoteParticipants({ channelId }: { channelId: string }) {
  const [list, setList] = useState<VoiceParticipantDTO[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ participants: VoiceParticipantDTO[] }>(`/api/voice/${channelId}/participants`)
        .then((r) => alive && setList(r.participants))
        .catch(() => alive && setList([]));
    void load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onUpdate = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== channelId) return;
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 1500); // 接続が終わる頃に取り直す
    };
    window.addEventListener("nexus:voice-updated", onUpdate);
    const interval = setInterval(() => void load(), 30_000);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("nexus:voice-updated", onUpdate);
    };
  }, [channelId]);

  if (list.length === 0) return null;
  return (
    <ul className="ml-7 border-l border-border pl-2">
      {list.map((p) => (
        <li key={p.userId} className="flex items-center gap-1.5 py-0.5 text-xs text-fg-muted">
          <span className="size-5 rounded-full bg-surface-4" />
          <span className="truncate">{p.displayName}</span>
          {p.isMuted && <MicOff className="size-3 shrink-0 text-red-400" />}
          {p.isScreenSharing && <MonitorUp className="size-3 shrink-0 text-accent" />}
        </li>
      ))}
    </ul>
  );
}

export function VoiceChannelParticipants({ channelId }: { channelId: string }) {
  const joined = useVoice((s) => s.channelId === channelId && (s.status === "connected" || s.status === "reconnecting"));
  return joined ? <LiveParticipants /> : <RemoteParticipants channelId={channelId} />;
}
