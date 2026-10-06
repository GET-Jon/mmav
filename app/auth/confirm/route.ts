import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

function safeDestination(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\r\n]/.test(value)
  ) {
    return "/";
  }

  return value;
}

function localRedirect(destination: string) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: destination,
      "Cache-Control": "private, no-store",
    },
  });
}

function isEmailOtpType(
  value: string | null,
): value is
  | "email"
  | "signup"
  | "magiclink"
  | "invite"
  | "recovery"
  | "email_change" {
  return (
    value === "email" ||
    value === "signup" ||
    value === "magiclink" ||
    value === "invite" ||
    value === "recovery" ||
    value === "email_change"
  );
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const next = safeDestination(
    request.nextUrl.searchParams.get("next") || "/onboarding",
  );
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
    : tokenHash && isEmailOtpType(type)
      ? await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        })
      : null;

  if (!result || result.error || !result.data.session) {
    const params = new URLSearchParams({
      next,
      authError: "confirmation",
    });
    response.headers.set("Location", `/login?${params}`);
  }

  return response;
}
