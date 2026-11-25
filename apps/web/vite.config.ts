import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Tauri から起動された場合は Tauri 用の設定を使う
const isTauri = !!process.env.TAURI_ENV_PLATFORM;
const apiTarget = process.env.VITE_DEV_API_PROXY ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // 共有パッケージはビルド済みファイルではなくソースを直接使う（常に最新の型・コード）
    alias: { "@nexus/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)) },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    // 開発中は同じオリジンに見せるため、API と WebSocket をバックエンドへ中継する
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/socket.io": { target: apiTarget, ws: true, changeOrigin: true },
    },
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // Tauri: Windows は WebView2(Chromium)、macOS は WebKit(Safari相当)
    target: isTauri ? (process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome110" : "safari16") : "es2022",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        // 大きなライブラリは別ファイルに分けて、初回表示を速くする
        advancedChunks: {
          groups: [
            { name: "livekit", test: /node_modules[\\/](livekit-client|@livekit)/ },
            { name: "markdown", test: /node_modules[\\/](react-markdown|remark|micromark|mdast|unified|hast)/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
});
