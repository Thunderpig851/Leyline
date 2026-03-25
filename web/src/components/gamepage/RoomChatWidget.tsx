import { useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { apiGet, apiPost, getStoredUsername } from "../../lib/api";
import { socket } from "../../lib/socket";

type RoomChatMessage =
{
  _id: string;
  roomId: string;
  authorUserId: string;
  authorUsername: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type ChatHistoryResponse =
{
  ok: boolean;
  messages?: RoomChatMessage[];
  error?: string;
};

type ChatSendResponse =
{
  ok: boolean;
  message?: RoomChatMessage;
  error?: string;
};

type RoomChatWidgetProps =
{
  roomId: string;
};

export default function RoomChatWidget({ roomId }: RoomChatWidgetProps)
{
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentUsername = getStoredUsername() || "You";

  function appendMessage(message: RoomChatMessage)
  {
    setMessages((prev) =>
    {
      if (prev.some((item) => item._id === message._id)) return prev;
      return [...prev, message];
    });
  }

  useEffect(() =>
  {
    let cancelled = false;

    async function loadMessages()
    {
      setLoading(true);
      setError(null);

      const res = await apiGet<ChatHistoryResponse>(`/api/chat/rooms/${roomId}/messages?limit=50`);

      if (cancelled) return;

      if (!res.ok || !res.data?.ok)
      {
        setError(res.ok ? res.data?.error || "Failed to load messages." : res.error);
        setMessages([]);
        setLoading(false);
        return;
      }

      setMessages(Array.isArray(res.data.messages) ? res.data.messages : []);
      setLoading(false);
    }

    void loadMessages();

    return () =>
    {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() =>
  {
    function handleNewMessage(payload: { message?: RoomChatMessage })
    {
      if (!payload?.message) return;
      if (payload.message.roomId !== roomId) return;

      appendMessage(payload.message);
    }

    socket.on("room-chat:new-message", handleNewMessage);

    return () =>
    {
      socket.off("room-chat:new-message", handleNewMessage);
    };
  }, [roomId]);

  useEffect(() =>
  {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function handleSend(e: React.FormEvent)
  {
    e.preventDefault();

    const body = input.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    const res = await apiPost<ChatSendResponse>(`/api/chat/rooms/${roomId}/messages`, { body });

    if (!res.ok || !res.data?.ok)
    {
      setError(res.ok ? res.data?.error || "Failed to send message." : res.error);
      setSending(false);
      return;
    }

    setInput("");
    setSending(false);
  }

  const renderedMessages = useMemo(() => messages, [messages]);

  return (
    <div className="flex h-[min(62vh,700px)] flex-col">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-sm font-medium text-slate-100">Game Chat</div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            Loading chat...
          </div>
        ) : renderedMessages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No messages yet.
          </div>
        ) : (
          <div className="space-y-3">
            {renderedMessages.map((message) => {
              const isSelf = message.authorUsername === currentUsername;

              return (
                <div
                  key={message._id}
                  className={`rounded-2xl border p-3 ${
                    isSelf
                      ? "border-teal-300/20 bg-teal-400/10"
                      : "border-white/10 bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className={`text-xs font-semibold ${isSelf ? "text-teal-200" : "text-slate-200"}`}>
                      {isSelf ? "You" : message.authorUsername}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>

                  <div className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
                    {message.body}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="border-t border-white/10 p-4">
        {error && (
          <div className="mb-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder="Type a message..."
            className="min-h-[52px] flex-1 resize-none rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-teal-300/40"
          />
          <button
            type="submit"
            disabled={sending}
            className="inline-flex h-[52px] items-center gap-2 rounded-2xl border border-teal-300/30 bg-teal-400/15 px-4 text-sm font-medium text-teal-100 transition hover:border-teal-200 hover:bg-teal-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send size={14} />
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}