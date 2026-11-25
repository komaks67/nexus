import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * パスワードは scrypt（総当たりに強いハッシュ関数）で保存する。
 * 形式: scrypt$N$r$p$salt(base64)$hash(base64)
 */
const KEY_LEN = 64;
const PARAMS = { N: 16384, r: 8, p: 1 } as const;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEY_LEN, { ...PARAMS, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !n || !r || !p || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  // 比較にかかる時間からパスワードを推測されないよう、一定時間で比較する
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** 存在しないユーザーでも同じ時間がかかるようにするためのダミー */
export const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(KEY_LEN).toString("base64");
