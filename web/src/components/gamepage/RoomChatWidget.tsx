import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Coins, Dices, Send } from "lucide-react";
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
  roomId: string;
};

const DIE_OPTIONS = [4, 6, 8, 12, 20] as const;

export default function RoomChatWidget({ roomId }: RoomChatWidgetProps)
{
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedDieSides, setSelectedDieSides] = useState<number>(20);
  const [dieMenuOpen, setDieMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [runningAction, setRunningAction] = useState<"dice" | "coin" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dieMenuRef = useRef<HTMLDivElement | null>(null);
  const currentUserId = getStoredUserId() || "";

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
    function handlePointerDown(event: MouseEvent)
    {
      if (!dieMenuRef.current) return;
      if (dieMenuRef.current.contains(event.target as Node)) return;
      setDieMenuOpen(false);
    }

    if (dieMenuOpen)
    {
      document.addEventListener("mousedown", handlePointerDown);
    }

    return () =>
    {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [dieMenuOpen]);

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

    const res = await apiPost<ChatSendResponse>(`/api/chat/rooms/${roomId}/messages`, { body });

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
    if (runningAction) return;

    setRunningAction("dice");
    setError(null);
    setDieMenuOpen(false);

    const res = await apiPost<ChatSendResponse>(`/api/chat/rooms/${roomId}/actions`,
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
    if (runningAction) return;

    setRunningAction("coin");
    setError(null);
    setDieMenuOpen(false);

    const res = await apiPost<ChatSendResponse>(`/api/chat/rooms/${roomId}/actions`,
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
    <div className="flex h-[min(70vh,700px)] flex-col">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-sm font-medium text-slate-100">Game Chat</div>

        <div className="mt-3 grid grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <div ref={dieMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setDieMenuOpen((value) => !value)}
              className="flex h-full w-[88px] items-center justify-between rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-left text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-slate-900"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Dices className="h-4 w-4 shrink-0 text-teal-200" />
                <span>d{selectedDieSides}</span>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition ${dieMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {dieMenuOpen ? (
              <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-[88px] rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur">
                <div className="flex flex-col gap-2">
                  {DIE_OPTIONS.map((sides) =>
                  {
                    const selected = selectedDieSides === sides;

                    return (
                      <button
                        key={sides}
                        type="button"
                        onClick={() =>
                        {
                          setSelectedDieSides(sides);
                          setDieMenuOpen(false);
                        }}
                        className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                          selected
                            ? "border border-teal-300/40 bg-teal-400/15 text-teal-100"
                            : "border border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20 hover:bg-white/[0.07]"
                        }`}
                      >
                        d{sides}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

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

                  {isGameAction ? (
                    <GameActionBubble action={message.action} fallbackBody={message.body} />
                  ) : (
                    <div className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
                      {message.body}
                    </div>
                  )}
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

function GameActionBubble({
  action,
  fallbackBody,
}: {
  action?: RoomChatAction | null;
  fallbackBody: string;
})
{
  if (action?.type === "dice-roll")
  {
    return (
      <div className="mt-2 rounded-2xl border border-amber-300/20 bg-slate-950/55 px-3 py-2.5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/85">
          <Dices className="h-3.5 w-3.5" />
          Dice Roll
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="text-sm text-slate-300">
            {action.resultLabel || `d${action.diceSides || "?"}`}
          </div>
          <div className="text-2xl font-black tracking-tight text-amber-100">
            {action.resultNumber ?? "?"}
          </div>
        </div>
      </div>
    );
  }

  if (action?.type === "coin-flip")
  {
    return (
      <div className="mt-2 rounded-2xl border border-amber-300/20 bg-slate-950/55 px-3 py-2.5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/85">
          <Coins className="h-3.5 w-3.5" />
          Coin Flip
        </div>
        <div className="mt-2 text-xl font-black tracking-tight text-amber-100">
          {action.resultLabel || "?"}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
      {fallbackBody}
    </div>
  );
}