"use client";

import { useEffect, useState } from "react";
import { evaluationDraftStorageKey } from "@/lib/evaluation-draft";

export default function NewEvaluationPage() {
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      window.localStorage.removeItem(evaluationDraftStorageKey);
      // Reload the workspace so restored drafts and cached component state
      // cannot carry the previous vehicle into a new evaluation.
      window.location.replace("/");
    } catch {
      setError("Unable to clear the previous draft. Allow browser storage, then reload to start a new evaluation.");
    }
  }, []);

  return <p className="p-6 text-sm text-slate-700" role="status">{error || "Opening a new evaluation…"}</p>;
}
