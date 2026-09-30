"use client";

import { useCallback, useEffect, useState } from "react";

type ThreadMessage = {
  id: string;
  authorLabel: string;
  authorRole: "owner" | "partner" | "system";
  message: string;
  createdAt: string;
};

type Props = {
  endpoint: string;
  canReply?: boolean;
  compact?: boolean;
};

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function PartsIssueThread({ endpoint, canReply = true, compact = false }: Props) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load the parts issue conversation.");
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the parts issue conversation.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  async function sendReply() {
    const message = draft.trim();
    if (!message) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", message }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not send the reply.");
      setDraft("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the reply.");
    } finally {
      setSending(false);
    }
  }

  return <div className={compact ? "mt-3" : "mt-4"}>
    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Issue conversation</div>
    <div className="mt-2 space-y-2">
      {loading ? <div className="text-xs font-semibold text-slate-400">Loading conversation…</div> : null}
      {!loading && !messages.length ? <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">No conversation yet.</div> : null}
      {messages.map((item) => <div key={item.id} className={`rounded-lg border px-3 py-2 ${item.authorRole === "owner" ? "border-blue-100 bg-blue-50/60" : item.authorRole === "partner" ? "border-slate-200 bg-white" : "border-amber-100 bg-amber-50/60"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-black">
          <span className={item.authorRole === "owner" ? "text-blue-800" : item.authorRole === "partner" ? "text-slate-700" : "text-amber-800"}>{item.authorLabel}</span>
          <span className="font-semibold text-slate-400">{when(item.createdAt)}</span>
        </div>
        <div className="mt-1 whitespace-pre-wrap text-xs font-semibold leading-5 text-slate-700">{item.message}</div>
      </div>)}
    </div>
    {canReply ? <div className="mt-3 flex gap-2">
      <textarea rows={compact ? 1 : 2} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Reply about this parts issue…" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
      <button type="button" disabled={!draft.trim() || sending} onClick={() => void sendReply()} className="self-end rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{sending ? "Sending…" : "Reply"}</button>
    </div> : null}
    {error ? <div className="mt-2 text-xs font-bold text-red-700">{error}</div> : null}
  </div>;
}
