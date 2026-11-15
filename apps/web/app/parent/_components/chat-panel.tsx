"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string; sessionIds?: string[] };

// Parent AI chat (ai-chat-plan.md §2), inline in the home card. Read-only: answers from the
// parent views via /api/parent/chat.
// ponytail: whole reply at once, no streaming; add streaming if replies feel slow.
export function ChatPanel({ child }: { child: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/parent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-30).map(({ role, content }) => ({ role, content })) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setMessages([...next, { role: "assistant", content: body.reply, sessionIds: body.sessionIds }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-col justify-end gap-3">
      <div className="max-h-[320px] space-y-3 overflow-y-auto" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <p
              className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-left text-sm ${
                m.role === "user" ? "bg-[#2f45e8] text-white" : "border border-line bg-white"
              }`}
            >
              {m.content}
            </p>
            {m.sessionIds && m.sessionIds.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {m.sessionIds.slice(0, 5).map((id, n) => (
                  <Link key={id} href={`/parent/${id}`} className="rounded-full bg-[#2f45e8]/10 px-2.5 py-0.5 text-xs font-semibold text-[#2f45e8] hover:underline">
                    Session {n + 1}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <p className="text-sm text-foreground/50">Looking at {child}&apos;s sessions…</p>}
        {error && <p className="text-sm text-warn">{error}</p>}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-center gap-2 rounded-full border border-line bg-white py-1.5 pl-3.5 pr-2 shadow-sm focus-within:border-[#2f45e8]/40"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#2f45e8" aria-hidden>
          <path d="M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8zM18 13l.9 2.6 2.6.9-2.6.9L18 20l-.9-2.6-2.6-.9 2.6-.9z" />
        </svg>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Make ${child} learn more about addition…`}
          aria-label="Ask about your child's learning"
          maxLength={2000}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-foreground/40"
        />
        <button type="submit" disabled={busy || !draft.trim()} aria-label="Send" className="rounded-full p-1.5 hover:bg-foreground/5 disabled:opacity-40">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 5v7a3 3 0 0 1-3 3H5M9 11l-4 4 4 4" />
          </svg>
        </button>
      </form>
    </div>
  );
}
