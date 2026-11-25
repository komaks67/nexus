import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * スプリットビュー（2画面）の状態。
 * main = 左のメイン画面、side = 右のサブパネル。どちらにも何でも表示できる。
 */
export type PaneContent =
  | { kind: "channel"; channelId: string }
  | { kind: "thread"; channelId: string; rootId: string }
  | {
      kind: "summary";
      channelId: string;
      threadId: string | null;
      afterMessageId: string | null;
      /** 同じ条件でも「もう一度」押したら作り直すためのキー */
      requestKey: number;
    };

export type PaneId = "main" | "side";

interface LayoutState {
  main: PaneContent | null;
  side: PaneContent | null;
  focused: PaneId;
  /** サブパネルの幅（全体に対する割合 %） */
  sideWidth: number;
  open: (pane: PaneId, content: PaneContent) => void;
  closeSide: () => void;
  swap: () => void;
  focus: (pane: PaneId) => void;
  setSideWidth: (pct: number) => void;
  /** 検索結果から飛んだときに強調表示するメッセージ */
  highlight: { channelId: string; messageId: string } | null;
  setHighlight: (h: { channelId: string; messageId: string } | null) => void;
  /** 削除されたチャンネル等を表示していたら閉じる */
  clearChannel: (channelId: string) => void;
}

export const useLayout = create<LayoutState>()(
  persist(
    (set) => ({
      main: null,
      side: null,
      focused: "main",
      sideWidth: 40,
      highlight: null,
      setHighlight: (h) => set({ highlight: h }),
      open: (pane, content) => set({ [pane]: content, focused: pane } as Partial<LayoutState>),
      closeSide: () => set({ side: null, focused: "main" }),
      swap: () => set((s) => ({ main: s.side ?? s.main, side: s.side ? s.main : s.side })),
      focus: (pane) => set({ focused: pane }),
      setSideWidth: (pct) => set({ sideWidth: Math.min(70, Math.max(22, pct)) }),
      clearChannel: (channelId) =>
        set((s) => ({
          main: s.main?.channelId === channelId ? null : s.main,
          side: s.side?.channelId === channelId ? null : s.side,
        })),
    }),
    {
      name: "nexus.layout",
      // 要約パネルは再読み込み時に復元しない（AI を勝手に再実行しないため）
      partialize: (s) => ({
        main: s.main?.kind === "summary" ? null : s.main,
        side: s.side?.kind === "summary" ? null : s.side,
        sideWidth: s.sideWidth,
      }),
    },
  ),
);
