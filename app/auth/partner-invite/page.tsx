"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function PartnerInviteLandingPage() {
  const [message, setMessage] = useState("Finishing your Lot Logic sign-in…");

  useEffect(() => {
    async function finish() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        window.location.replace(`/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent("/partner/profile?onboarding=1")}`);
        return;
      }

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseAnonKey) {
          setMessage("Lot Logic authentication is not configured correctly.");
          return;
        }
        const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) {
          setMessage(error.message);
          return;
        }
        window.location.replace("/partner/profile?onboarding=1");
        return;
      }

      setMessage("This invitation could not be completed. Ask the dealer to resend your partner invitation.");
    }
    void finish();
  }, []);

  return <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4 text-slate-950"><div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm"><div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Lot Logic Partner Portal</div><h1 className="mt-2 text-2xl font-black">Partner invitation</h1><p className="mt-3 text-sm leading-6 text-slate-600">{message}</p></div></main>;
}
