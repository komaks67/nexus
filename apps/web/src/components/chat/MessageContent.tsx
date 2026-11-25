import { memo } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown 表示。
 * - HTML タグは表示せず文字として扱う（react-markdown の既定動作）→ <script> 等を埋め込めない
 * - リンクは http/https/mailto だけ許可（javascript: などは無効化）
 */
function safeUrl(url: string): string {
  const out = defaultUrlTransform(url);
  return /^(https?:|mailto:)/i.test(out) ? out : "";
}

export const MessageContent = memo(function MessageContent({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="md text-[15px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrl}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          // 外部画像の自動読み込みは IP アドレス漏えいの原因になるため、リンクとして表示
          img: ({ src, alt }) =>
            typeof src === "string" && src ? (
              <a href={safeUrl(src)} target="_blank" rel="noopener noreferrer nofollow">
                🖼 {alt || src}
              </a>
            ) : null,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
