import { useLocalParticipant } from "@livekit/components-react";
import { useCallback, useState } from "react";
import {
  applyNoiseSuppression,
  isUserCancelled,
  mediaErrorMessage,
  startScreenShare,
  type ScreenQuality,
} from "../../lib/media";
import { useVoice } from "../../stores/voice";

/** マイク・カメラ・画面共有・雑音除去の操作（エラー処理込み） */
export function useVoiceControls() {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const noiseSuppression = useVoice((s) => s.noiseSuppression);
  const deafened = useVoice((s) => s.deafened);
  const [busy, setBusy] = useState<null | "mic" | "camera" | "screen" | "ns">(null);

  const warn = (msg: string | null) => useVoice.getState().setWarning(msg);

  const toggleMic = useCallback(async () => {
    setBusy("mic");
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
      warn(null);
    } catch (err) {
      warn(mediaErrorMessage(err, "マイク"));
    } finally {
      setBusy(null);
    }
  }, [localParticipant, isMicrophoneEnabled]);

  const toggleCamera = useCallback(async () => {
    setBusy("camera");
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
      warn(null);
    } catch (err) {
      warn(mediaErrorMessage(err, "カメラ"));
    } finally {
      setBusy(null);
    }
  }, [localParticipant, isCameraEnabled]);

  const toggleScreen = useCallback(
    async (quality: ScreenQuality) => {
      setBusy("screen");
      try {
        if (isScreenShareEnabled) await localParticipant.setScreenShareEnabled(false);
        else await startScreenShare(localParticipant, quality);
        warn(null);
      } catch (err) {
        // 共有する画面の選択をキャンセルした場合はエラー扱いしない
        if (!isUserCancelled(err)) warn(mediaErrorMessage(err, "画面共有"));
      } finally {
        setBusy(null);
      }
    },
    [localParticipant, isScreenShareEnabled],
  );

  const toggleNoiseSuppression = useCallback(async () => {
    const next = !noiseSuppression;
    setBusy("ns");
    try {
      await applyNoiseSuppression(localParticipant, next);
      useVoice.getState().setNoiseSuppression(next);
    } catch (err) {
      warn(mediaErrorMessage(err, "マイク"));
    } finally {
      setBusy(null);
    }
  }, [localParticipant, noiseSuppression]);

  const toggleDeafen = useCallback(() => useVoice.getState().setDeafened(!deafened), [deafened]);

  return {
    busy,
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    noiseSuppression,
    deafened,
    toggleMic,
    toggleCamera,
    toggleScreen,
    toggleNoiseSuppression,
    toggleDeafen,
  };
}
