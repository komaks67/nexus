import { IS_DESKTOP } from "./config";

/**
 * OS のネイティブ通知。
 * デスクトップ版は Tauri の通知プラグイン、Web版はブラウザの Notification API を使う。
 */
let permission: boolean | null = null;

export async function ensureNotificationPermission(): Promise<boolean> {
  if (permission !== null) return permission;
  try {
    if (IS_DESKTOP) {
      const n = await import("@tauri-apps/plugin-notification");
      permission = (await n.isPermissionGranted()) || (await n.requestPermission()) === "granted";
    } else if ("Notification" in window) {
      permission =
        Notification.permission === "granted" ||
        (Notification.permission !== "denied" && (await Notification.requestPermission()) === "granted");
    } else {
      permission = false;
    }
  } catch (err) {
    console.warn("通知の許可を確認できませんでした:", err);
    permission = false;
  }
  return permission;
}

export async function notify(title: string, body: string, onClick?: () => void): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  // 本文は長すぎると OS 側で切れるので短くする
  const text = body.length > 140 ? `${body.slice(0, 140)}…` : body;
  try {
    if (IS_DESKTOP) {
      const n = await import("@tauri-apps/plugin-notification");
      n.sendNotification({ title, body: text });
    } else {
      const notification = new Notification(title, { body: text, icon: "/favicon.svg", tag: title });
      notification.onclick = () => {
        window.focus();
        onClick?.();
        notification.close();
      };
    }
  } catch (err) {
    console.warn("通知を表示できませんでした:", err);
  }
}
