import type { AttachmentDTO } from "@nexus/shared";
import { Download, FileIcon, FileText, Maximize2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import { Spinner } from "../common/ui";

interface UrlResponse {
  url: string;
  inline: boolean;
  expiresInSec: number;
}

const kind = (ct: string) =>
  ct.startsWith("image/") ? "image" : ct.startsWith("video/") ? "video" : ct.startsWith("audio/") ? "audio" : ct === "application/pdf" ? "pdf" : "file";

/** 添付ファイルのプレビュー（画像・動画・音声はその場で再生、それ以外はダウンロード） */
export function AttachmentView({ attachment }: { attachment: AttachmentDTO }) {
  const k = kind(attachment.contentType);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);

  // 署名付きURLは10分で切れるので、表示のたびに取り直す
  const fetchUrl = useCallback(async () => {
    setError(null);
    try {
      const res = await api<UrlResponse>(`/api/attachments/${attachment.id}/url`);
      setUrl(res.inline ? res.url : null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [attachment.id]);

  useEffect(() => {
    if (k !== "file" && k !== "pdf") void fetchUrl();
  }, [fetchUrl, k]);

  const download = async () => {
    try {
      const res = await api<UrlResponse>(`/api/attachments/${attachment.id}/url`, { query: { download: "1" } });
      const a = document.createElement("a");
      a.href = res.url;
      a.rel = "noopener";
      a.click();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const openPdf = async () => {
    try {
      const res = await api<UrlResponse>(`/api/attachments/${attachment.id}/url`);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const meta = (
    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-fg-muted">
      <span className="truncate" title={attachment.filename}>
        {attachment.filename}
      </span>
      <span className="shrink-0">{formatBytes(attachment.size)}</span>
      <button onClick={() => void download()} title="ダウンロード" aria-label="ダウンロード" className="ml-auto shrink-0 hover:text-fg">
        <Download className="size-3.5" />
      </button>
    </div>
  );

  if (error) {
    return (
      <div className="mt-1 max-w-sm rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-red-300">
        {attachment.filename}: {error}
        <button onClick={() => void fetchUrl()} className="ml-2 underline">
          再読み込み
        </button>
      </div>
    );
  }

  if (k === "image" || k === "video" || k === "audio") {
    return (
      <div className="mt-1 w-fit max-w-md overflow-hidden rounded-md border border-border bg-surface-1">
        {!url ? (
          <div className="flex h-32 w-64 items-center justify-center">
            <Spinner />
          </div>
        ) : k === "image" ? (
          <button onClick={() => setLightbox(true)} className="group relative block" aria-label="拡大表示">
            <img src={url} alt={attachment.filename} loading="lazy" onError={() => void fetchUrl()} className="max-h-80 object-contain" />
            <Maximize2 className="absolute right-2 top-2 hidden size-4 text-white drop-shadow group-hover:block" />
          </button>
        ) : k === "video" ? (
          <video src={url} controls preload="metadata" className="max-h-80 w-full" onError={() => void fetchUrl()} />
        ) : (
          <audio src={url} controls preload="none" className="w-80" />
        )}
        {meta}
        {lightbox && url && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6" onClick={() => setLightbox(false)}>
            <button className="absolute right-4 top-4 text-white" aria-label="閉じる">
              <X className="size-6" />
            </button>
            <img src={url} alt={attachment.filename} className="max-h-full max-w-full object-contain" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1 flex w-80 max-w-full items-center gap-3 rounded-md border border-border bg-surface-1 p-3">
      {k === "pdf" ? <FileText className="size-8 shrink-0 text-red-400" /> : <FileIcon className="size-8 shrink-0 text-fg-muted" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm" title={attachment.filename}>
          {attachment.filename}
        </div>
        <div className="text-xs text-fg-muted">{formatBytes(attachment.size)}</div>
      </div>
      {k === "pdf" && (
        <button onClick={() => void openPdf()} className="text-xs text-accent hover:underline">
          開く
        </button>
      )}
      <button onClick={() => void download()} title="ダウンロード" aria-label="ダウンロード" className="text-fg-muted hover:text-fg">
        <Download className="size-4" />
      </button>
    </div>
  );
}
