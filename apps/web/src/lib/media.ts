import {
  ConnectionError,
  LocalAudioTrack,
  MediaDeviceFailure,
  Track,
  VideoPresets,
  type AudioCaptureOptions,
  type LocalParticipant,
  type RoomOptions,
} from "livekit-client";

/**
 * 音声・映像まわりの設定とエラー処理。
 */

/** マイクの取り込み設定（エコー除去・音量自動調整・雑音除去） */
export function micOptions(noiseSuppression: boolean): AudioCaptureOptions {
  return {
    echoCancellation: true,
    autoGainControl: true,
    noiseSuppression,
    channelCount: 1,
  };
}

export function roomOptions(noiseSuppression: boolean): RoomOptions {
  return {
    // 見えている大きさに合わせて受信画質を自動調整（回線と CPU の節約）
    adaptiveStream: true,
    // 誰も見ていない画質の映像は送らない
    dynacast: true,
    audioCaptureDefaults: micOptions(noiseSuppression),
    videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
    publishDefaults: {
      dtx: true, // 無音の間は送信しない
      red: true, // パケットが欠けても音が途切れにくくする
      videoCodec: "vp9",
      backupCodec: true, // VP9 非対応の相手には自動で VP8 も送る
    },
  };
}

export type ScreenQuality = "1080p60" | "1440p60" | "4k60" | "4k30-text";

export const SCREEN_QUALITIES: Record<
  ScreenQuality,
  { label: string; width: number; height: number; fps: number; bitrate: number; hint: "motion" | "detail" | "text" }
> = {
  "1080p60": { label: "1080p / 60fps", width: 1920, height: 1080, fps: 60, bitrate: 6_000_000, hint: "motion" },
  "1440p60": { label: "1440p / 60fps", width: 2560, height: 1440, fps: 60, bitrate: 9_000_000, hint: "motion" },
  "4k60": { label: "4K / 60fps（ゲーム・動画）", width: 3840, height: 2160, fps: 60, bitrate: 16_000_000, hint: "motion" },
  "4k30-text": { label: "4K / 30fps（文字・資料をくっきり）", width: 3840, height: 2160, fps: 30, bitrate: 10_000_000, hint: "text" },
};

/** 画面共有を開始（システム音声つき） */
export async function startScreenShare(lp: LocalParticipant, quality: ScreenQuality): Promise<void> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("この環境は画面共有に対応していません（ブラウザまたはOSを更新してください）");
  }
  const q = SCREEN_QUALITIES[quality];
  await lp.setScreenShareEnabled(
    true,
    {
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      systemAudio: "include",
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      contentHint: q.hint,
      resolution: { width: q.width, height: q.height, frameRate: q.fps },
    },
    {
      videoCodec: "vp9",
      // VP9 の階層化（SVC）: 1本の映像から見る人ごとに解像度を切り出せる
      scalabilityMode: "L3T3_KEY",
      screenShareEncoding: { maxBitrate: q.bitrate, maxFramerate: q.fps },
      backupCodec: true,
    },
  );
}

/** マイクの雑音除去設定を切り替える（マイクを取り直さずに設定だけ変える） */
export async function applyNoiseSuppression(lp: LocalParticipant, on: boolean): Promise<void> {
  const track = lp.getTrackPublication(Track.Source.Microphone)?.track;
  if (track instanceof LocalAudioTrack) {
    await track.restartTrack(micOptions(on));
  }
}

/** 画面共有を自分でキャンセルしたかどうか（エラー表示しない） */
export function isUserCancelled(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === "NotAllowedError" && /denied by user|permission denied|cancel/i.test(String((err as Error).message ?? ""))
    ? true
    : name === "AbortError";
}

type Device = "マイク" | "カメラ" | "画面共有";

/** LiveKit が判定したデバイス障害の種類 → 日本語メッセージ */
export function failureMessage(failure: MediaDeviceFailure | undefined, device: Device): string | null {
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return `${device}の使用が許可されていません。ブラウザ（またはOS）の設定で許可してください`;
    case MediaDeviceFailure.NotFound:
      return `${device}が見つかりません。接続を確認してください`;
    case MediaDeviceFailure.DeviceInUse:
      return `${device}は他のアプリで使用中です。他のアプリを閉じてから再度お試しください`;
    case MediaDeviceFailure.Other:
      return `${device}を開始できませんでした`;
    default:
      return null;
  }
}

/** マイク・カメラ・画面のエラーを分かりやすい日本語にする */
export function mediaErrorMessage(err: unknown, device: Device = "マイク"): string {
  const name = (err as { name?: string })?.name;
  if (name === "OverconstrainedError") return `${device}がこの画質に対応していません。画質を下げてお試しください`;
  if (name === "NotSupportedError" || name === "TypeError") return `この環境は${device}に対応していません`;
  const failure = MediaDeviceFailure.getFailure(err);
  if (failure && failure !== MediaDeviceFailure.Other) return failureMessage(failure, device)!;
  return `${device}を開始できませんでした: ${(err as Error)?.message ?? "不明なエラー"}`;
}

export function connectionErrorMessage(err: unknown): string {
  if (err instanceof ConnectionError) {
    return "音声サーバーに接続できませんでした。ネットワーク（ファイアウォール・VPN）を確認してください";
  }
  return `音声接続でエラーが発生しました: ${(err as Error)?.message ?? "不明なエラー"}`;
}
