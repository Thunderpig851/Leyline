import { useEffect, useMemo, useRef, useState } from "react";
import { Coins, Dices, Send } from "lucide-react";
import { apiGet, apiPost, getStoredUserId } from "../../lib/api";
import { socket } from "../../lib/socket";

type RoomChatAction =
{
  type: "dice-roll" | "coin-flip";
  diceSides?: number | null;
  resultNumber?: number | null;
  resultLabel?: string | null;
};

type RoomChatMessage =
{
  _id: string;
  roomId: string;
  authorUserId: string;
  authorUsername: string;
  kind?: "message" | "game-action";
  body: string;
  action?: RoomChatAction | null;
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
  chatTargetId: string;
};

const DIE_OPTIONS = [4, 6, 8, 12, 20] as const;

export default function RoomChatWidget({ chatTargetId }: RoomChatWidgetProps)
{
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedDieSides, setSelectedDieSides] = useState<number>(20);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [runningAction, setRunningAction] = useState<"dice" | "coin" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvedRoomId, setResolvedRoomId] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentUserId = getStoredUserId() || "";

  function appendMessage(message: RoomChatMessage)
  {
    setMessages((prev) =>
    {
      if (prev.some((item) => item._id === message._id)) return prev;
      return [...prev, message];
    });

    if (message.roomId)
    {
      setResolvedRoomId(message.roomId);
    }
  }

  useEffect(() =>
  {
    let cancelled = false;

    async function loadMessages()
    {
      if (!chatTargetId)
      {
        setMessages([]);
        setResolvedRoomId("");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const res = await apiGet<ChatHistoryResponse>(`/api/chat/targets/${chatTargetId}/messages?limit=50`);

      if (cancelled) return;

      if (!res.ok || !res.data?.ok)
      {
        setError(res.ok ? res.data?.error || "Failed to load messages." : res.error);
        setMessages([]);
        setResolvedRoomId("");
        setLoading(false);
        return;
      }

      const nextMessages = Array.isArray(res.data.messages) ? res.data.messages : [];
      setMessages(nextMessages);
      setResolvedRoomId(nextMessages[0]?.roomId || "");
      setLoading(false);
    }

    void loadMessages();

    return () =>
    {
      cancelled = true;
    };
  }, [chatTargetId]);

  useEffect(() =>
  {
    function handleNewMessage(payload: { message?: RoomChatMessage })
    {
      if (!payload?.message) return;

      const incomingRoomId = payload.message.roomId;
      const matchesTarget = incomingRoomId === chatTargetId;
      const matchesResolvedRoom = resolvedRoomId ? incomingRoomId === resolvedRoomId : false;

      if (!matchesTarget && !matchesResolvedRoom)
      {
        return;
      }

      appendMessage(payload.message);
    }

    socket.on("room-chat:new-message", handleNewMessage);

    return () =>
    {
      socket.off("room-chat:new-message", handleNewMessage);
    };
  }, [chatTargetId, resolvedRoomId]);

  useEffect(() =>
  {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  async function handleSend(e: React.FormEvent)
  {
    e.preventDefault();

    const body = input.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    const res = await apiPost<ChatSendResponse>(`/api/chat/targets/${chatTargetId}/messages`, { body });

    if (!res.ok || !res.data?.ok)
    {
      setError(res.ok ? res.data?.error || "Failed to send message." : res.error);
      setSending(false);
      return;
    }

    if (res.data.message)
    {
      appendMessage(res.data.message);
    }

    setInput("");
    setSending(false);
  }

  async function handleRollDie()
  {
    if (runningAction || !chatTargetId) return;

    setRunningAction("dice");
    setError(null);

    const res = await apiPost<ChatSendResponse>(`/api/chat/targets/${chatTargetId}/actions`,
    {
      actionType: "dice-roll",
      diceSides: selectedDieSides,
    });

    if (!res.ok || !res.data?.ok)
    {
      setError(res.ok ? res.data?.error || "Failed to roll die." : res.error);
      setRunningAction(null);
      return;
    }

    if (res.data.message)
    {
      appendMessage(res.data.message);
    }

    setRunningAction(null);
  }

  async function handleFlipCoin()
  {
    if (runningAction || !chatTargetId) return;

    setRunningAction("coin");
    setError(null);

    const res = await apiPost<ChatSendResponse>(`/api/chat/targets/${chatTargetId}/actions`,
    {
      actionType: "coin-flip",
    });

    if (!res.ok || !res.data?.ok)
    {
      setError(res.ok ? res.data?.error || "Failed to flip coin." : res.error);
      setRunningAction(null);
      return;
    }

    if (res.data.message)
    {
      appendMessage(res.data.message);
    }

    setRunningAction(null);
  }

  const renderedMessages = useMemo(() => messages, [messages]);

  return (
    <div className="flex h-[min(62vh,700px)] flex-col">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-sm font-medium text-slate-100">Game Chat</div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
          <label className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
            <Dices className="h-4 w-4 shrink-0 text-teal-200" />
            <span className="shrink-0 font-medium text-slate-200">Die</span>
            <select
              value={selectedDieSides}
              onChange={(e) => setSelectedDieSides(Number(e.target.value))}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none"
            >
              {DIE_OPTIONS.map((sides) => (
                <option key={sides} value={sides} className="bg-slate-950 text-slate-100">
                  d{sides}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => { void handleRollDie(); }}
            disabled={Boolean(runningAction)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-teal-300/30 bg-teal-400/15 px-3 py-2 text-xs font-semibold text-teal-100 transition hover:border-teal-200 hover:bg-teal-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Dices className="h-4 w-4" />
            {runningAction === "dice" ? "Rolling..." : "Roll"}
          </button>

          <button
            type="button"
            onClick={() => { void handleFlipCoin(); }}
            disabled={Boolean(runningAction)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-400/12 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-200/60 hover:bg-amber-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Coins className="h-4 w-4" />
            {runningAction === "coin" ? "Flipping..." : "Flip"}
          </button>
        </div>
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
            {renderedMessages.map((message) =>
            {
              const isSelf = message.authorUserId === currentUserId;
              const isGameAction = message.kind === "game-action";

              return (
                <div
                  key={message._id}
                  className={`rounded-2xl border p-3 ${
                    isSelf
                      ? "border-teal-300/20 bg-teal-400/10"
                      : isGameAction
                        ? "border-amber-300/20 bg-amber-400/10"
                        : "border-white/10 bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className={`text-xs font-semibold ${isSelf ? "text-teal-200" : isGameAction ? "text-amber-200" : "text-slate-200"}`}>
                      {isSelf ? "You" : message.authorUsername}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>

                  <div className="mt-2 text-sm leading-6 text-slate-100">
                    {renderActionBody(message.action, message.body) || message.body}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="border-t border-white/10 px-4 py-3">
        {error ? (
          <div className="mb-3 rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="room-chat-input">Message</label>
          <textarea
            id="room-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder="Type a message..."
            className="min-h-[52px] flex-1 resize-none rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-teal-300/40"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-teal-300/30 bg-teal-400/15 text-teal-100 transition hover:border-teal-200 hover:bg-teal-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function renderActionBody(action: RoomChatAction | null | undefined, fallback: string)
{
  if (action?.type === "dice-roll")
  {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span>{fallback.split(":")[0]}:</span>
        <span className="inline-flex items-center rounded-full border border-teal-300/30 bg-teal-400/10 px-2 py-0.5 text-xs font-semibold text-teal-100">
          {action.resultLabel || `d${action.diceSides || "?"}`}
        </span>
        <span className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-xs font-semibold text-slate-100">
          {action.resultNumber ?? "?"}
        </span>
      </span>
    );
  }

  if (action?.type === "coin-flip")
  {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span>{fallback.split(":")[0]}:</span>
        <span className="inline-flex items-center rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-xs font-semibold text-amber-100">
          {action.resultLabel || "Result"}
        </span>
      </span>
    );
  }

  return fallback;
}