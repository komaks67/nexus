export function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
  const hm = d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `今日 ${hm}`;
  if (yesterday) return `昨日 ${hm}`;
  return `${d.toLocaleDateString("ja-JP")} ${hm}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

/** 日本語の文字が多ければ英語へ、そうでなければ日本語へ翻訳する */
export function guessTranslateTarget(text: string): "ja" | "en" {
  const ja = (text.match(/[぀-ヿ㐀-鿿]/g) ?? []).length;
  return ja / Math.max(1, text.replace(/\s/g, "").length) > 0.2 ? "en" : "ja";
}

export function newNonce(): string {
  return `${Date.now().toString(36)}-${crypto.randomUUID()}`;
}
