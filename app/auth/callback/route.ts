import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

function safeDestination(value: string | null) {
  // Only allow local paths; redirects must stay on the browser's current host.
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) {
    return "/";
  }
  return value;
}

function localRedirect(destination: string) {
  // Netlify's internal request URL can be the deploy permalink rather than the
  // public preview alias. A relative Location preserves the browser's origin
  // and keeps the session cookies and the onboarding request on the same host.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: destination, "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const next = safeDestination(request.nextUrl.searchParams.get("next"));
  const response = localRedirect(next);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const result = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && (type === "email" || type === "signup" || type === "magiclink" || type === "invite" || type === "recovery" || type === "email_change")
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : null;

  if (!result || result.error || !result.data.session) {
    // Never silently continue into a protected page after a failed exchange.
    const params = new URLSearchParams({ next, authError: "confirmation" });
    response.headers.set("Location", `/login?${params}`);
  }

  return response;
}
