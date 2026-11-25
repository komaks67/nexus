# Nexus 起動手順（別PC用）

## 0. インストールしておくもの

| ソフト | 用途 | 入手先 |
|---|---|---|
| Node.js 20.11以上 | アプリ本体を動かす | https://nodejs.org |
| Docker Desktop | データベースなどをまとめて動かす | https://www.docker.com/products/docker-desktop |
| Git | コードをダウンロードする | https://git-scm.com |

Docker Desktop は起動した状態にしておく。

---

## 初回の起動

### 1. コードをダウンロード

```bash
git clone -b claude/nexus-mvp https://github.com/komaks67/nexus.git
```

```bash
cd nexus
```

### 2. 部品（ライブラリ）をインストール

```bash
npm install
```

### 3. 設定ファイルを作る

Mac / Linux:

```bash
cp .env.example .env
```

Windows:

```bash
copy .env.example .env
```

`.env` をメモ帳などで開き、次を書き換える。

- `JWT_SECRET`：32文字以上の好きなランダム文字列（必須）
- `ANTHROPIC_API_KEY`：AI要約・翻訳を使う場合だけ入れる（空でも他は動く）

### 4. データベースなどを起動

```bash
docker compose up -d
```

初回は数分かかる。起動後、10秒ほど待ってから次へ。

### 5. テーブルを作る（初回のみ）

```bash
npm run db:migrate
```

「✅ マイグレーション完了」と出れば成功。

### 6. アプリを起動

```bash
npm run dev
```

ブラウザで http://localhost:5173 を開き、アカウントを作る。

### 7. 動作確認テスト（任意）

アプリを起動したまま、別のターミナルで:

```bash
npm test
```

「すべて成功」と出ればOK。

---

## 2回目以降の起動

```bash
docker compose up -d
```

```bash
npm run dev
```

## 終了

- アプリ：起動したターミナルで Ctrl + C
- データベースなど（データは消えない）:

```bash
docker compose down
```

---

## デスクトップアプリとして起動（任意）

追加で必要なもの:

- Rust：https://rustup.rs
- Windows：Visual Studio Build Tools（「C++ によるデスクトップ開発」にチェック）
- Mac：次のコマンドで開発ツールを入れる

```bash
xcode-select --install
```

初回の手順 1〜5 を済ませてから:

```bash
npm run tauri:dev
```

初回は組み立てに5〜10分かかる。

---

## うまくいかないとき

| 症状 | 原因 | 対処 |
|---|---|---|
| `docker compose` でエラー | Docker Desktop が起動していない | 起動してから再実行 |
| `port is already allocated` | 5432・6379 等を他のソフトが使用中 | そのソフトを止めるか `docker-compose.yml` の番号を変える |
| `db:migrate` が失敗 | データベースの起動が終わっていない | 10〜20秒待って再実行 |
| 「環境変数が正しくありません」 | `.env` が無い／`JWT_SECRET` が短い | 手順3をやり直す（32文字以上） |
| 「操作が多すぎます」で登録できない | 登録は同じ場所から10分に5回まで | 10分待つ |
| 「AI機能が設定されていません」 | APIキー未設定 | `.env` に `ANTHROPIC_API_KEY` を入れて `npm run dev` をやり直す |
| ボイスに接続できない | LiveKit が動いていない | `docker compose ps` で `livekit` を確認 |
