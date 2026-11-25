// 動作確認スクリプト: node scripts/smoke-test.mjs
// API と WebSocket の主要機能を一通り呼び出して、期待どおり動くかを確認する
import { io } from "socket.io-client";

const BASE = process.env.API_URL ?? "http://localhost:3001";
const rnd = Math.random().toString(36).slice(2, 8);
let failed = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failed++;
};

async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

const connect = (token) =>
  new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, transports: ["websocket"] });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
  });

// 1. 認証
const a = await api("/api/auth/register", { method: "POST", body: { username: `alice_${rnd}`, displayName: "Alice", password: "password123" } });
check("ユーザー登録", a.status === 201 && a.json.token);
const b = await api("/api/auth/register", { method: "POST", body: { username: `bob_${rnd}`, displayName: "Bob", password: "password123" } });
const dup = await api("/api/auth/register", { method: "POST", body: { username: `ALICE_${rnd}`, displayName: "x", password: "password123" } });
check("同名ユーザーは409", dup.status === 409);
const badLogin = await api("/api/auth/login", { method: "POST", body: { username: `alice_${rnd}`, password: "wrong" } });
check("誤パスワードは401", badLogin.status === 401);
const login = await api("/api/auth/login", { method: "POST", body: { username: `alice_${rnd}`, password: "password123" } });
check("ログイン", login.status === 200);
const A = login.json.token, B = b.json.token;
const me = await api("/api/auth/me", { token: A });
check("/me", me.status === 200 && me.json.user.displayName === "Alice" && !("passwordHash" in me.json.user));
check("トークン無しは401", (await api("/api/auth/me")).status === 401);
check("不正トークンは401", (await api("/api/auth/me", { token: "x.y.z" })).status === 401);

// 2. サーバー・チャンネル
const srv = await api("/api/servers", { token: A, method: "POST", body: { name: "テスト鯖" } });
check("サーバー作成", srv.status === 201);
const serverId = srv.json.server.id;
const chs = await api(`/api/servers/${serverId}/channels`, { token: A });
check("初期チャンネル3つ", chs.json.channels?.length === 3);
const general = chs.json.channels.find((c) => c.type === "TEXT");
const voice = chs.json.channels.find((c) => c.type === "VOICE");
check("非メンバーはチャンネル取得不可(404)", (await api(`/api/servers/${serverId}/channels`, { token: B })).status === 404);
const join = await api("/api/servers/join", { token: B, method: "POST", body: { inviteCode: srv.json.server.inviteCode } });
check("招待コードで参加", join.status === 200 && join.json.server.myRole === "MEMBER");
const newCh = await api(`/api/servers/${serverId}/channels`, { token: B, method: "POST", body: { name: "x", type: "TEXT" } });
check("一般メンバーはチャンネル作成不可(403)", newCh.status === 403);
const newCh2 = await api(`/api/servers/${serverId}/channels`, { token: A, method: "POST", body: { name: "Dev Talk", type: "TEXT" } });
check("管理者はチャンネル作成可", newCh2.status === 201 && newCh2.json.channel.name === "dev-talk");

// 3. リアルタイム
const sa = await connect(A);
const sb = await connect(B);
check("WebSocket接続", sa.connected && sb.connected);
let rejected = false;
try { await connect("bad"); } catch { rejected = true; }
check("不正トークンのWebSocketは拒否", rejected);

const members = await api(`/api/servers/${serverId}/members`, { token: A });
check("メンバー一覧とオンライン状態", members.json.members?.length === 2 && members.json.members.every((m) => m.status === "online"));

const gotTyping = new Promise((r) => sb.once("typing", r));
sa.emit("typing:start", { channelId: general.id });
const t = await Promise.race([gotTyping, new Promise((r) => setTimeout(() => r(null), 2000))]);
check("入力中インジケーター", t?.userId === a.json.user.id);

const gotMsg = new Promise((r) => sb.once("message:new", r));
const nonce = `n_${rnd}_000001`;
const ack = await sa.emitWithAck("message:send", { channelId: general.id, content: "Hello **world** <script>alert(1)</script>", nonce });
check("メッセージ送信(ack)", ack.ok === true, ack.error);
const recv = await Promise.race([gotMsg, new Promise((r) => setTimeout(() => r(null), 2000))]);
check("相手にリアルタイム配信", recv?.id === ack.data?.id);
const ack2 = await sa.emitWithAck("message:send", { channelId: general.id, content: "Hello again", nonce });
check("同じnonceの再送は重複しない", ack2.ok && ack2.data.id === ack.data.id);
const empty = await sa.emitWithAck("message:send", { channelId: general.id, content: "   ", nonce: `n_${rnd}_000002` });
check("空メッセージは拒否", empty.ok === false);
const toVoice = await sa.emitWithAck("message:send", { channelId: voice.id, content: "hi", nonce: `n_${rnd}_000003` });
check("ボイスチャンネルへの送信は拒否", toVoice.ok === false);

// スレッド
const gotThread = new Promise((r) => sa.once("thread:updated", r));
const reply = await sb.emitWithAck("message:send", { channelId: general.id, content: "スレッド返信", parentId: ack.data.id, nonce: `n_${rnd}_000004` });
check("スレッド返信", reply.ok && reply.data.parentId === ack.data.id);
const tu = await Promise.race([gotThread, new Promise((r) => setTimeout(() => r(null), 2000))]);
check("スレッド件数の更新通知", tu?.replyCount === 1);
const nested = await sb.emitWithAck("message:send", { channelId: general.id, content: "x", parentId: reply.data.id, nonce: `n_${rnd}_000005` });
check("スレッドの入れ子は拒否", nested.ok === false);
const thread = await api(`/api/channels/${general.id}/threads/${ack.data.id}`, { token: A });
check("スレッド取得", thread.json.replies?.length === 1);

// 履歴とページ送り
for (let i = 0; i < 5; i++) await sa.emitWithAck("message:send", { channelId: general.id, content: `msg ${i} 検索テスト`, nonce: `n_${rnd}_1${i}0000` });
const hist = await api(`/api/channels/${general.id}/messages?limit=3`, { token: A });
check("履歴取得（スレッド返信は除外）", hist.json.messages.length === 3 && hist.json.hasMore === true && hist.json.messages.every((m) => !m.parentId));
const older = await api(`/api/channels/${general.id}/messages?limit=50&before=${hist.json.messages[0].id}`, { token: A });
check("古い履歴のページ送り", older.json.messages.length === 3 && older.json.hasMore === false);
check("時系列順", hist.json.messages[0].id < hist.json.messages[2].id);

// 既読
sb.emit("channel:read", { channelId: general.id, messageId: hist.json.messages[2].id });
await new Promise((r) => setTimeout(r, 300));
const chsB = await api(`/api/servers/${serverId}/channels`, { token: B });
check("既読位置の保存", chsB.json.channels.find((c) => c.id === general.id).lastReadMessageId === hist.json.messages[2].id);

// 4. 検索（インデックス反映を待つ）
await new Promise((r) => setTimeout(r, 2500));
const s1 = await api(`/api/search?q=${encodeURIComponent("検索テスト")}`, { token: B });
check("全文検索", s1.status === 200 && s1.json.hits.length === 5, `${s1.json.processingTimeMs}ms`);
check("検索結果のハイライト（HTMLを使わない）", s1.json.hits[0]?.highlighted.includes("\u0001") && !s1.json.hits[0]?.highlighted.includes("<em>"));
const s2 = await api(`/api/search?q=hello&authorId=${b.json.user.id}`, { token: A });
check("送信者で絞り込み", s2.status === 200 && s2.json.hits.length === 0);
const outsider = await api("/api/auth/register", { method: "POST", body: { username: `eve_${rnd}`, displayName: "Eve", password: "password123" } });
const s3 = await api(`/api/search?q=hello`, { token: outsider.json.token });
check("他人のサーバーは検索に出ない", s3.status === 200 && s3.json.hits.length === 0);
const s4 = await api(`/api/search?q=hello&serverId=${serverId}`, { token: outsider.json.token });
check("他人のサーバー指定は404", s4.status === 404);

// 5. AI / 音声 / アップロード（外部サービス未起動時は適切なエラーになるか）
const ai = await api("/api/ai/status", { token: A });
check("AI状態の取得", ai.status === 200);
const sum = await api("/api/ai/summarize", { token: A, method: "POST", body: { channelId: general.id } });
check("AI要約（キー未設定なら503）", ai.json.enabled ? sum.status === 200 : sum.status === 503);
const vt = await api("/api/voice/token", { token: B, method: "POST", body: { channelId: voice.id } });
check("LiveKitトークン発行", vt.status === 200 && vt.json.token.split(".").length === 3);
const vt2 = await api("/api/voice/token", { token: B, method: "POST", body: { channelId: general.id } });
check("テキストチャンネルのトークンは拒否", vt2.status === 400);
const vt3 = await api("/api/voice/token", { token: outsider.json.token, method: "POST", body: { channelId: voice.id } });
check("非メンバーのトークンは拒否", vt3.status === 404);
const big = await api("/api/uploads", { token: A, method: "POST", body: { channelId: general.id, filename: "a.bin", contentType: "application/octet-stream", size: 10 ** 15 } });
check("上限超えのファイルは拒否", big.status === 400);

// 6. セキュリティヘッダー
const h = await fetch(BASE + "/health");
check("セキュリティヘッダー", h.headers.get("x-content-type-options") === "nosniff" && !!h.headers.get("content-security-policy"));

sa.close(); sb.close();
console.log(failed ? `\n${failed} 件失敗` : "\nすべて成功");
process.exit(failed ? 1 : 0);
