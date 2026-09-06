"use client";

import { useEffect, useState } from "react";

export type PartnerConversationMessage = {
  id: string;
  role: "owner" | "partner";
  message: string;
  createdAt: string;
};

export function PartnerFindingConversation({ findingId }: { findingId: string }) {
  const [messages, setMessages] = useState<PartnerConversationMessage[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/partner/inspections/finding-conversation?findingId=${encodeURIComponent(findingId)}`, {
          cache: "no-store",
        });
        const payload = await response.json() as { messages?: PartnerConversationMessage[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Conversation could not be loaded.");
        if (!cancelled) {
          setMessages(payload.messages || []);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setMessages([]);
          setError(loadError instanceof Error ? loadError.message : "Conversation could not be loaded.");
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [findingId]);

  if (messages === null) {
    return <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">Loading conversation…</div>;
  }

  if (error) {
    return <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>;
  }

  if (!messages.length) {
    return <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">No prior clarification messages.</div>;
  }

  return <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
    <div className="mb-2 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Owner / inspector conversation</div>
    <div className="space-y-2">
      {messages.map((entry) => <div key={entry.id} className={`rounded-lg px-3 py-2 text-xs leading-5 ${entry.role === "owner" ? "bg-amber-50 text-amber-950" : "bg-blue-50 text-blue-950"}`}>
        <div className="mb-0.5 text-[9px] font-black uppercase tracking-[0.08em] opacity-60">{entry.role === "owner" ? "Owner" : "Inspector"}</div>
        {entry.message}
      </div>)}
    </div>
  </div>;
}
