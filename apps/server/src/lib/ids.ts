import { randomBytes } from "node:crypto";

/**
 * UUID v7 を作る（先頭48ビットがミリ秒の時刻）。
 * 同じミリ秒内でも順番が崩れないよう、直前の値より必ず大きくする。
 */
let lastMs = 0;
let seq = 0;

export function uuidv7(): string {
  let ms = Date.now();
  if (ms <= lastMs) {
    seq = (seq + 1) & 0xfff;
    if (seq === 0) lastMs += 1;
    ms = lastMs;
  } else {
    lastMs = ms;
    seq = randomBytes(2).readUInt16BE(0) & 0x7ff;
  }
  const bytes = randomBytes(16);
  bytes.writeUIntBE(ms, 0, 6);
  bytes[6] = 0x70 | ((seq >> 8) & 0x0f);
  bytes[7] = seq & 0xff;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 招待コード（紛らわしい文字 0/O/1/l/I を除外） */
const INVITE_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function inviteCode(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += INVITE_ALPHABET[b % INVITE_ALPHABET.length];
  return out;
}

const AVATAR_COLORS = ["#5865F2", "#3BA55C", "#FAA61A", "#ED4245", "#EB459E", "#00A8FC", "#9B59B6", "#1ABC9C"];
export function randomAvatarColor(): string {
  return AVATAR_COLORS[randomBytes(1)[0]! % AVATAR_COLORS.length]!;
}
