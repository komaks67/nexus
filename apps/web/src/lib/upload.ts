import type { AttachmentDTO, InitUploadResponse } from "@nexus/shared";
import { api } from "./api";

/**
 * 大容量ファイルを R2 へ「直接」アップロードする。
 *  1. サーバーにパートごとの署名付きURLをもらう
 *  2. ファイルを 64MB ずつに分けて、4本同時に R2 へ PUT
 *  3. 全パートの ETag（受け取り証明）をサーバーに送って結合してもらう
 * 途中で失敗したパートは最大3回までやり直す。
 */
const CONCURRENCY = 4;
const MAX_RETRIES = 3;

export interface UploadProgress {
  loaded: number;
  total: number;
}

function putPart(url: string, blob: Blob, signal: AbortSignal, onProgress: (loaded: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    // fetch はアップロード進捗が取れないので XMLHttpRequest を使う
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        if (!etag) {
          reject(new Error("ETag を読み取れません。バケットの CORS 設定で ETag を ExposeHeaders に追加してください"));
          return;
        }
        resolve(etag);
      } else {
        reject(new Error(`アップロードに失敗しました（${xhr.status}）`));
      }
    };
    xhr.onerror = () => reject(new Error("ストレージに接続できません（CORS 設定またはネットワークを確認してください）"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

export async function uploadFile(
  file: File,
  channelId: string,
  onProgress: (p: UploadProgress) => void,
  signal: AbortSignal,
): Promise<AttachmentDTO> {
  const init = await api<InitUploadResponse>("/api/uploads", {
    method: "POST",
    body: { channelId, filename: file.name, contentType: file.type || "application/octet-stream", size: file.size },
    signal,
  });

  const loadedByPart = new Map<number, number>();
  const report = () => {
    let loaded = 0;
    for (const v of loadedByPart.values()) loaded += v;
    onProgress({ loaded: Math.min(loaded, file.size), total: file.size });
  };

  const results: { partNumber: number; etag: string }[] = [];
  const queue = [...init.parts];

  const worker = async () => {
    for (;;) {
      const part = queue.shift();
      if (!part) return;
      const start = (part.partNumber - 1) * init.partSize;
      const blob = file.slice(start, Math.min(start + init.partSize, file.size));
      let attempt = 0;
      for (;;) {
        try {
          const etag = await putPart(part.url, blob, signal, (l) => {
            loadedByPart.set(part.partNumber, l);
            report();
          });
          loadedByPart.set(part.partNumber, blob.size);
          report();
          results.push({ partNumber: part.partNumber, etag });
          break;
        } catch (err) {
          if ((err as Error).name === "AbortError" || ++attempt >= MAX_RETRIES) throw err;
          loadedByPart.set(part.partNumber, 0);
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, init.parts.length) }, worker));
    const { attachment } = await api<{ attachment: AttachmentDTO }>(`/api/uploads/${init.attachmentId}/complete`, {
      method: "POST",
      body: { parts: results },
      signal,
    });
    return attachment;
  } catch (err) {
    // 途中のデータが残らないよう中止を伝える（失敗しても無視）
    void api(`/api/uploads/${init.attachmentId}`, { method: "DELETE" }).catch(() => undefined);
    throw err;
  }
}
