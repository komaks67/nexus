import { LIMITS, type AttachmentDTO } from "@nexus/shared";
import { Paperclip, SendHorizontal, X } from "lucide-react";
import { useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { errorMessage } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import { getSocket } from "../../lib/socket";
import { uploadFile } from "../../lib/upload";
import { useChat } from "../../stores/chat";

interface UploadItem {
  key: string;
  file: File;
  loaded: number;
  status: "uploading" | "done" | "error";
  error?: string;
  attachment?: AttachmentDTO;
  controller: AbortController;
}

/** メッセージ入力欄（Enter で送信、Shift+Enter で改行、ファイルはドラッグ＆ドロップ／貼り付けも可） */
export function Composer({
  channelId,
  parentId = null,
  placeholder,
}: {
  channelId: string;
  parentId?: string | null;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastTyping = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const uploading = uploads.some((u) => u.status === "uploading");
  const ready = uploads.filter((u) => u.status === "done" && u.attachment);
  const canSend = !uploading && (text.trim().length > 0 || ready.length > 0) && text.length <= LIMITS.messageMax;

  const patchUpload = (key: string, patch: Partial<UploadItem>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  const addFiles = (files: FileList | File[]) => {
    setError(null);
    const arr = Array.from(files);
    if (uploads.length + arr.length > LIMITS.attachmentsPerMessage) {
      setError(`1回に添付できるのは${LIMITS.attachmentsPerMessage}個までです`);
      return;
    }
    for (const file of arr) {
      const item: UploadItem = {
        key: crypto.randomUUID(),
        file,
        loaded: 0,
        status: "uploading",
        controller: new AbortController(),
      };
      setUploads((list) => [...list, item]);
      uploadFile(file, channelId, (p) => patchUpload(item.key, { loaded: p.loaded }), item.controller.signal)
        .then((attachment) => patchUpload(item.key, { status: "done", attachment, loaded: file.size }))
        .catch((err: unknown) => {
          if ((err as Error).name === "AbortError") return;
          patchUpload(item.key, { status: "error", error: errorMessage(err) });
        });
    }
  };

  const removeUpload = (key: string) => {
    setUploads((list) => {
      list.find((u) => u.key === key)?.controller.abort();
      return list.filter((u) => u.key !== key);
    });
  };

  const send = () => {
    if (!canSend) return;
    void useChat.getState().sendMessage({
      channelId,
      parentId,
      content: text.trim(),
      attachmentIds: ready.map((u) => u.attachment!.id),
    });
    setText("");
    setUploads((list) => list.filter((u) => u.status !== "done"));
    textareaRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 日本語入力の変換確定中の Enter では送信しない
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    // 入力中の通知は3秒に1回まで
    if (Date.now() - lastTyping.current > 3000 && e.target.value.trim()) {
      lastTyping.current = Date.now();
      getSocket()?.emit("typing:start", { channelId });
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      addFiles(e.clipboardData.files);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  return (
    <div
      className="relative px-4 pb-4"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 top-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-accent/10 text-sm text-accent">
          ここにドロップしてアップロード（容量無制限級・R2へ直接送信）
        </div>
      )}

      {uploads.length > 0 && (
        <ul className="mb-2 space-y-1">
          {uploads.map((u) => (
            <li key={u.key} className="flex items-center gap-2 rounded-md bg-surface-1 px-2 py-1.5 text-xs">
              <span className="max-w-48 truncate">{u.file.name}</span>
              <span className="shrink-0 text-fg-subtle">{formatBytes(u.file.size)}</span>
              {u.status === "uploading" && (
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-surface-3" role="progressbar" aria-valuenow={Math.round((u.loaded / u.file.size) * 100)}>
                  <div className="h-full bg-accent transition-all" style={{ width: `${(u.loaded / Math.max(1, u.file.size)) * 100}%` }} />
                </div>
              )}
              {u.status === "done" && <span className="flex-1 text-success">アップロード完了</span>}
              {u.status === "error" && <span className="flex-1 truncate text-red-300">{u.error}</span>}
              <button onClick={() => removeUpload(u.key)} aria-label="取り消し" className="text-fg-muted hover:text-fg">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p role="alert" className="mb-1 text-xs text-red-300">{error}</p>}

      <div className="flex items-end gap-2 rounded-lg bg-surface-3 px-3 py-2">
        <button
          onClick={() => fileInput.current?.click()}
          title="ファイルを添付"
          aria-label="ファイルを添付"
          className="pb-0.5 text-fg-muted hover:text-fg"
        >
          <Paperclip className="size-5" />
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <textarea
          ref={textareaRef}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={1}
          placeholder={placeholder}
          maxLength={LIMITS.messageMax}
          aria-label="メッセージ"
          className="max-h-60 flex-1 resize-none bg-transparent py-0.5 text-[15px] outline-none placeholder:text-fg-subtle"
        />
        <button
          onClick={send}
          disabled={!canSend}
          title={uploading ? "アップロード完了まで待ってください" : "送信 (Enter)"}
          aria-label="送信"
          className="pb-0.5 text-accent disabled:text-fg-subtle"
        >
          <SendHorizontal className="size-5" />
        </button>
      </div>
      {text.length > LIMITS.messageMax * 0.9 && (
        <p className="mt-1 text-right text-xs text-warning">
          {text.length}/{LIMITS.messageMax}
        </p>
      )}
    </div>
  );
}
