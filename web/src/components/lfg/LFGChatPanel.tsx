import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { apiPost, getStoredAccessToken, getStoredUsername } from "../../lib/api";

type LFGChatMessage =
{
  _id: string;
  authorUsername: string;
  body: string;
  createdAt: string;
};

type LFGChatPanelProps =
{
  messages: LFGChatMessage[];
  loading: boolean;
  error: string | null;
  onAppendMessage: (message: LFGChatMessage) => void;
};

type PostMessageResponse =
{
  ok: boolean;
  message: LFGChatMessage;
};

export default function LFGChatPanel({
  messages,
  loading,
  error,
  onAppendMessage,
}: LFGChatPanelProps)
{
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const logRef = useRef<HTMLDivElement | null>(null);

  const username = getStoredUsername();
  const isAuthenticated = Boolean(getStoredAccessToken());

  useEffect(() =>
  {
    const node = logRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  async function submitMessage()
  {
    if (!isAuthenticated || sending) return;

    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setSendError(null);

    const result = await apiPost<PostMessageResponse>("/api/lfg/messages", { body });

    if (!result.ok)
    {
      setSendError(result.error);
      setSending(false);
      return;
    }

    onAppendMessage(result.data.message);
    setDraft("");
    setSending(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>)
  {
    if (event.key === "Enter" && !event.shiftKey)
    {
      event.preventDefault();
      void submitMessage();
    }
  }

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-slate-200/10 p-3 ring-1 ring-white/5 lg:h-full">
      <div
        ref={logRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/45 p-3"
      >
        {loading ? (
          <div className="text-sm text-slate-300">Loading...</div>
        ) : error ? (
          <div className="rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-slate-400">No messages yet.</div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) =>
            {
              const ownMessage = Boolean(username) && username === message.authorUsername;

              return (
                <div
                  key={message._id}
                  className={
                    ownMessage
                      ? "rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2"
                      : "rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2"
                  }
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em]">
                    <span className={ownMessage ? "text-emerald-200" : "text-cyan-200"}>
                      {message.authorUsername}
                    </span>
                    <span className="text-slate-500">{formatClockTime(message.createdAt)}</span>
                  </div>

                  <div className="mt-1 break-words text-sm text-slate-100">{message.body}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-3 shrink-0">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          maxLength={1500}
          disabled={!isAuthenticated || sending}
          placeholder={isAuthenticated ? "Type here..." : "Sign in to chat"}
          className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-emerald-300/40 focus:ring-4 focus:ring-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-70"
        />

        <div className="mt-2 flex items-center justify-end gap-3">
          {sendError ? <div className="mr-auto text-xs text-red-200">{sendError}</div> : null}

          <button
            type="button"
            onClick={() => void submitMessage()}
            disabled={!isAuthenticated || sending || draft.trim().length === 0}
            className="rounded-xl border border-teal-300/35 bg-teal-500/10 px-4 py-2 text-sm text-slate-100 transition-colors transition-shadow duration-150 hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900 hover:shadow-lg hover:shadow-teal-400/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </section>
  );
}

function formatClockTime(value: string)
{
  const date = new Date(value);

  if (Number.isNaN(date.getTime()))
  {
    return "--";
  }

  return new Intl.DateTimeFormat(undefined,
  {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}