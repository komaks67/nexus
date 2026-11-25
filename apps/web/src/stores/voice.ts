import type { VoiceTokenResponse } from "@nexus/shared";
import { create } from "zustand";
import { api, errorMessage } from "../lib/api";

export type VoiceStatus = "idle" | "fetching" | "connecting" | "connected" | "reconnecting" | "error";

interface VoiceState {
  channelId: string | null;
  token: string | null;
  url: string | null;
  status: VoiceStatus;
  error: string | null;
  /** 通話は続けられるが知らせたい問題（マイクが使えない等） */
  warning: string | null;
  /** 端末の雑音除去（ブラウザ標準のノイズ抑制）を使うか */
  noiseSuppression: boolean;
  /** 相手の音声をすべて聞こえなくする（スピーカーミュート） */
  deafened: boolean;
  join: (channelId: string) => Promise<void>;
  leave: () => void;
  setStatus: (status: VoiceStatus) => void;
  setError: (message: string | null) => void;
  setWarning: (message: string | null) => void;
  setNoiseSuppression: (on: boolean) => void;
  setDeafened: (on: boolean) => void;
}

export const useVoice = create<VoiceState>((set, get) => ({
  channelId: null,
  token: null,
  url: null,
  status: "idle",
  error: null,
  warning: null,
  noiseSuppression: localStorage.getItem("nexus.ns") !== "0",
  deafened: false,

  join: async (channelId) => {
    if (get().channelId === channelId && get().status !== "error") return;
    const prev = get().channelId;
    if (prev) get().leave();
    set({ channelId, status: "fetching", error: null, warning: null, token: null, url: null });
    try {
      const res = await api<VoiceTokenResponse>("/api/voice/token", { method: "POST", body: { channelId } });
      // 取得中に別の操作をされていたら捨てる
      if (get().channelId !== channelId) return;
      set({ token: res.token, url: res.url, status: "connecting" });
    } catch (err) {
      if (get().channelId === channelId) set({ status: "error", error: errorMessage(err) });
    }
  },

  leave: () => {
    const channelId = get().channelId;
    set({ channelId: null, token: null, url: null, status: "idle", error: null, warning: null, deafened: false });
    if (channelId) void api(`/api/voice/${channelId}/left`, { method: "POST" }).catch(() => undefined);
  },

  setStatus: (status) => set({ status }),
  setError: (message) => set({ error: message, ...(message ? { status: "error" as const } : {}) }),
  setWarning: (message) => set({ warning: message }),
  setNoiseSuppression: (on) => {
    localStorage.setItem("nexus.ns", on ? "1" : "0");
    set({ noiseSuppression: on });
  },
  setDeafened: (on) => set({ deafened: on }),
}));
