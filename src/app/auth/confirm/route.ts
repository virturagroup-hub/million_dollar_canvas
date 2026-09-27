import { serverClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token_hash");
  const code = url.searchParams.get("code");
  try {
    const db = await serverClient();
    const result = token
      ? await db.auth.verifyOtp({ token_hash: token, type: "email" })
      : code
        ? await db.auth.exchangeCodeForSession(code)
        : null;
    if (result && !result.error)
      return NextResponse.redirect(new URL("/?confirmed=1", url.origin));
  } catch {
    /* Display a bounded error without exposing provider details. */
  }
  return NextResponse.redirect(
    new URL("/?auth_error=confirmation", url.origin),
  );
}
