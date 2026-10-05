"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.replace("/");
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
    >
      Sign out
    </button>
  );
}
