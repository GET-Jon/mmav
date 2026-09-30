import { NextResponse } from "next/server";

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerAuthClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
