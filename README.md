# Nexus — 次世代コミュニケーションプラットフォーム（フェーズ1〜3）

Discord の基本機能に加えて、**2画面表示（スプリットビュー）・大容量ファイル共有・高速全文検索・AI要約／翻訳・4K画面共有・軽量デスクトップアプリ**を備えたチャットアプリです。

## ディレクトリ構成

```
nexus/
├── package.json              # npm workspaces（モノレポ）の親
├── tsconfig.base.json        # 共通の TypeScript 設定
├── docker-compose.yml        # 開発用: PostgreSQL / Redis / Meilisearch / MinIO / LiveKit
├── .env.example              # 環境変数の見本
├── scripts/smoke-test.mjs    # API・WebSocket の自動動作確認（42項目）
├── packages/shared/          # サーバーと画面で共有する型・入力チェック（zod）・Socket.io イベント型
├── apps/server/              # バックエンド（Hono + Socket.io + Drizzle）
│   ├── drizzle/              # DB マイグレーション（テーブル作成SQL）
│   └── src/
│       ├── index.ts          # 起動・終了処理
│       ├── app.ts            # ルート登録・セキュリティヘッダー・CORS・エラー処理
│       ├── env.ts            # 環境変数のチェック
│       ├── db/               # schema.ts（テーブル定義）/ client.ts / migrate.ts
│       ├── lib/              # 認証(JWT)・パスワード・権限チェック・回数制限・ID生成など
│       ├── realtime/io.ts    # Socket.io（送信・入力中・既読・オンライン状態）
│       ├── routes/           # auth / servers / messages / uploads / search / ai / voice
│       └── services/         # messages / search(Meilisearch) / storage(R2) / ai / livekit / presence
└── apps/web/                 # フロントエンド（React 19 + Tailwind v4 + Zustand）
    ├── src/
    │   ├── lib/              # api / socket / upload(R2直送) / media(LiveKit設定) / notify(通知)
    │   ├── stores/           # auth / chat / layout(2画面) / voice
    │   ├── hooks/            # Socket.io イベントの反映、ショートカット
    │   └── components/       # layout / chat / search / ai / voice / dialogs / common
    └── src-tauri/            # デスクトップアプリ（Tauri v2: トレイ常駐・ネイティブ通知）
```

## 必要なもの

- Node.js 20.11 以上
- Docker（PostgreSQL などをまとめて起動するため）
- デスクトップ版をビルドする場合のみ: Rust（rustup）と、OS ごとの準備（下記）

## 起動手順（Web版）

インストール:

```bash
npm install
```

環境変数ファイルを作成（必要なら `JWT_SECRET` と `ANTHROPIC_API_KEY` を書き換え）:

```bash
cp .env.example .env
```

周辺サービスを起動:

```bash
docker compose up -d
```

テーブルを作成:

```bash
npm run db:migrate
```

サーバーと画面を同時に起動（http://localhost:5173 を開く）:

```bash
npm run dev
```

動作確認テスト（サーバー起動中に実行）:

```bash
npm test
```

> ユーザー登録は「同じIPから10分に5回まで」に制限しています。テストを何度も回すと制限に当たるので、その場合は10分待ってください。

## 本番ビルド

```bash
npm run build
```

- サーバー: `npm run start -w @nexus/server`
- 画面: `apps/web/dist` を静的ホスティング（Nginx / Cloudflare Pages 等）に置き、`/api` と `/socket.io` をサーバーへ中継してください（WebSocket の中継を有効に）。
- リバースプロキシ配下では `TRUST_PROXY=true` を設定すると、回数制限が正しい接続元IPで働きます。

## Cloudflare R2 の設定（フェーズ2）

1. R2 でバケットを作り、API トークン（読み書き）を発行します。
2. `.env` を次のように変更します。
   - `S3_ENDPOINT=https://<アカウントID>.r2.cloudflarestorage.com`
   - `S3_FORCE_PATH_STYLE=false`
   - `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
3. バケットの CORS ポリシーに次を設定します。**`ETag` の公開が必須**です（分割アップロードの完了処理に使います）。

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://あなたのドメイン", "tauri://localhost", "http://tauri.localhost"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

- 1ファイルの上限は `MAX_UPLOAD_BYTES`（既定 50GB）。64MB ずつ分割し、4本同時に送ります。

## AI（フェーズ2）

- `ANTHROPIC_API_KEY` を設定すると、AI要約・翻訳が使えます。未設定でも他の機能は通常どおり動きます。
- モデルは `AI_SUMMARY_MODEL` / `AI_TRANSLATE_MODEL` で変更できます（既定は `claude-opus-5-5`）。翻訳は回数が多くなりやすいので、費用を抑えたい場合は `claude-haiku-5-5` に変えてください。

## 音声・ビデオ（フェーズ3）

- 開発中は docker compose の LiveKit（`--dev` モード、キー: `devkey` / `secret`）を使います。
- 本番では LiveKit Cloud か、自前の LiveKit サーバー（TLS 必須）の `wss://` URL とキーを設定してください。
- 画面共有は 1080p60 / 1440p60 / 4K60 / 4K30（文字くっきり）から選べます。システム音声の共有は、Chrome / Edge（Windows）で対応しています。

## デスクトップアプリ（Tauri v2）

事前準備:

- 共通: Rust をインストール（https://rustup.rs）
- Windows: Visual Studio Build Tools（「C++ によるデスクトップ開発」）と WebView2（Windows 10/11 は標準搭載）
- macOS: Xcode Command Line Tools（`xcode-select --install`）

開発起動（Vite も自動で起動。API は Vite 経由で中継されるので追加設定不要）:

```bash
npm run tauri:dev
```

配布用ビルド: 接続先サーバーの URL を指定してビルドします（Windows は `.msi` / `.exe`、macOS は `.app` / `.dmg` が `apps/web/src-tauri/target/release/bundle/` にできます）。

```bash
VITE_API_URL=https://chat.example.com npm run tauri:build
```

- Windows の PowerShell では先に `$env:VITE_API_URL="https://chat.example.com"` を実行してから `npm run tauri:build` を実行します。
- サーバー側の `CORS_ORIGINS` に `tauri://localhost`（macOS）と `http://tauri.localhost`（Windows）を含めてください（`.env.example` には設定済み）。
- ×ボタンでは終了せずトレイに常駐します。終了はトレイメニューの「Nexus を終了」から。

## セキュリティ対策の要点

- **認証**: JWT を `Authorization` ヘッダーで送信（Cookie 不使用のため CSRF が構造的に起きない）。加えて Origin チェックも実施
- **XSS**: Markdown は HTML を描画しない設定。リンクは http/https/mailto のみ。検索の強調表示は HTML を使わない方式。HTML/SVG の添付は必ずダウンロード扱い
- **権限**: すべての API・Socket.io イベントでサーバー／チャンネルの所属を確認。検索も参加サーバーだけに限定
- **回数制限**: ログイン・登録・送信・検索・AI・アップロードに Redis ベースの制限
- **AI**: 会話ログ内の命令に従わないよう指示（プロンプトインジェクション対策）。画面を閉じたら生成も停止
