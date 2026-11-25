import "@livekit/components-styles";
import { LiveKitRoom, RoomAudioRenderer, useConnectionState } from "@livekit/components-react";
import { ConnectionState, DisconnectReason } from "livekit-client";
import { useEffect, useMemo, type ReactNode } from "react";
import { connectionErrorMessage, failureMessage, micOptions, roomOptions } from "../../lib/media";
import { useVoice } from "../../stores/voice";

/** LiveKit の接続状態を voice ストアへ反映する */
function ConnectionSync() {
  const state = useConnectionState();
  const setStatus = useVoice((s) => s.setStatus);
  const channelId = useVoice((s) => s.channelId);
  useEffect(() => {
    if (!channelId) return;
    if (state === ConnectionState.Connected) setStatus("connected");
    else if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) setStatus("reconnecting");
    else if (state === ConnectionState.Connecting) setStatus("connecting");
  }, [state, setStatus, channelId]);
  return null;
}

/**
 * アプリ全体を LiveKit の部屋でくるむ。
 * → 別のチャンネルを見ていても通話は切れない（Discord と同じ使い勝手）。
 */
export function VoiceRoomProvider({ children }: { children: ReactNode }) {
  const token = useVoice((s) => s.token);
  const url = useVoice((s) => s.url);
  const deafened = useVoice((s) => s.deafened);
  // 雑音除去の初期値は参加時点の設定を使う（途中の切り替えは applyNoiseSuppression で反映）
  const noiseSuppression = useMemo(() => useVoice.getState().noiseSuppression, [token]);
  const options = useMemo(() => roomOptions(noiseSuppression), [noiseSuppression]);

  return (
    <LiveKitRoom
      serverUrl={url ?? undefined}
      token={token ?? undefined}
      connect={!!token && !!url}
      audio={token ? micOptions(noiseSuppression) : false}
      video={false}
      options={options}
      data-lk-theme="default"
      style={{ display: "contents" }}
      onConnected={() => useVoice.getState().setStatus("connected")}
      onDisconnected={(reason) => {
        const v = useVoice.getState();
        if (!v.channelId) return; // 自分で退出した
        if (reason === DisconnectReason.CLIENT_INITIATED) return;
        if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
          v.setError("別の端末で同じボイスチャンネルに参加したため切断されました");
        } else if (reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.PARTICIPANT_REMOVED) {
          v.setError("ボイスチャンネルから退出させられました");
        } else {
          v.setError("音声サーバーとの接続が切れました");
        }
      }}
      onError={(err) => useVoice.getState().setError(connectionErrorMessage(err))}
      onMediaDeviceFailure={(failure, kind) => {
        // マイクが使えなくても「聞くだけ」で参加は続けられる
        const device = kind === "videoinput" ? "カメラ" : "マイク";
        const msg = failureMessage(failure, device) ?? `${device}を開始できませんでした`;
        useVoice.getState().setWarning(`${msg}（聞くだけで参加中）`);
      }}
    >
      {token && <ConnectionSync />}
      {token && <RoomAudioRenderer muted={deafened} />}
      {children}
    </LiveKitRoom>
  );
}
