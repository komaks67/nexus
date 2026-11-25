import { LIMITS, type ChannelType } from "@nexus/shared";
import { BookOpen, Hash, Volume2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { errorMessage } from "../../lib/api";
import { useChat } from "../../stores/chat";
import { useLayout } from "../../stores/layout";
import { Modal, Spinner, inputClass, primaryButtonClass } from "../common/ui";

const TYPES: { type: ChannelType; label: string; desc: string; icon: typeof Hash }[] = [
  { type: "TEXT", label: "テキスト", desc: "メッセージ・画像・ファイルを送る", icon: Hash },
  { type: "VOICE", label: "ボイス", desc: "音声通話・ビデオ・画面共有", icon: Volume2 },
  { type: "KNOWLEDGE", label: "ナレッジ", desc: "大事な情報をまとめて残す場所", icon: BookOpen },
];

export function CreateChannelDialog({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const [type, setType] = useState<ChannelType>("TEXT");
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const channel = await useChat
        .getState()
        .createChannel(serverId, { name: name.trim(), type, topic: topic.trim() || undefined });
      if (channel.type !== "VOICE") useLayout.getState().open("main", { kind: "channel", channelId: channel.id });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="チャンネルを作成" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3 p-4">
        <div className="space-y-1.5">
          {TYPES.map(({ type: t, label, desc, icon: Icon }) => (
            <label
              key={t}
              className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${
                type === t ? "border-accent bg-accent/10" : "border-border hover:bg-surface-3"
              }`}
            >
              <input type="radio" name="type" className="sr-only" checked={type === t} onChange={() => setType(t)} />
              <Icon className="size-5 text-fg-muted" />
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-fg-muted">{desc}</div>
              </div>
            </label>
          ))}
        </div>
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="チャンネル名"
          maxLength={LIMITS.channelNameMax}
          required
        />
        <input
          className={inputClass}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="トピック（任意）"
          maxLength={256}
        />
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end">
          <button className={primaryButtonClass} disabled={busy || !name.trim()}>
            {busy && <Spinner />}作成
          </button>
        </div>
      </form>
    </Modal>
  );
}
