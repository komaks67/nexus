import { isTauri } from "@tauri-apps/api/core";

/**
 * API の接続先。
 * - Web版: 空文字（同じオリジン。開発中は Vite が中継）
 * - デスクトップ版: VITE_API_URL（例: https://chat.example.com）を必ず指定
 */
export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export const IS_DESKTOP = isTauri();
