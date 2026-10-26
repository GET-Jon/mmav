"use client";

import { useEffect, useState } from "react";
import { evaluationDraftStorageKeyForUser } from "@/lib/evaluation-draft";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function NewEvaluationPage() {
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function reset() {
      try {
        const { data: { user }, error: authError } = await createSupabaseBrowserClient().auth.getUser();
        if (cancelled) return;
        if (authError || !user) {
          window.location.replace("/login?next=/evaluate/new");
          return;
        }
        window.localStorage.removeItem(evaluationDraftStorageKeyForUser(user.id));
        // Reload the workspace so restored drafts and cached component state
        // cannot carry the previous vehicle into a new evaluation.
        window.location.replace("/");
      } catch {
        if (!cancelled) setError("Unable to clear the previous draft. Allow browser storage, then reload to start a new evaluation.");
      }
    }
    void reset();
    return () => { cancelled = true; };
  }, []);

  return <p className="p-6 text-sm text-slate-700" role="status">{error || "Opening a new evaluation…"}</p>;
}
