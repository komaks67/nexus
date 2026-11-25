import { useEffect, useState } from "react";
import { useChat } from "../../stores/chat";

/** 「〇〇さんが入力中…」表示 */
export function TypingIndicator({ channelId }: { channelId: string }) {
  const typing = useChat((s) => s.typing[channelId]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!typing || Object.keys(typing).length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [typing]);

  const names = Object.values(typing ?? {})
    .filter((t) => t.until > now)
    .map((t) => t.name);

  return (
    <div className="h-5 px-4 text-xs text-fg-muted" aria-live="polite">
      {names.length > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-bounce rounded-full bg-fg-muted" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </span>
          {names.length > 3 ? "複数人が入力中…" : `${names.join("、")} が入力中…`}
        </span>
      )}
    </div>
  );
}
