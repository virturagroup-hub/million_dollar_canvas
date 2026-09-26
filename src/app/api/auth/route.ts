import { serverClient } from "@/lib/supabase/server";
import { publicConfig } from "@/lib/supabase/config";
import { displayName } from "@/domain/canvas";
import { checkOrigin, failure, json, readJson } from "@/server/http";
import { RequestError } from "@/server/submission";
export async function GET() {
  try {
    if (!publicConfig()) return json({ user: null, configured: false });
    const db = await serverClient();
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) return json({ user: null, configured: true });
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id,display_name")
      .eq("id", data.user.id)
      .single();
    if (profileError)
      throw new RequestError(
        503,
        "Your profile is unavailable. Check database setup.",
      );
    return json({
      user: { id: profile.id, displayName: profile.display_name },
      configured: true,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = (await readJson(request, 4096)) as Record<string, unknown>;
    if (!body || typeof body !== "object")
      throw new RequestError(400, "Invalid sign-in request.");
    const db = await serverClient();
    if (body.action === "signout") {
      const { error } = await db.auth.signOut();
      if (error)
        throw new RequestError(503, "Could not sign out. Please retry.");
      return json({ ok: true });
    }
    if (
      !["signin", "signup"].includes(String(body.action)) ||
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      body.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ||
      body.password.length < 8 ||
      body.password.length > 128
    )
      throw new RequestError(
        400,
        "Enter a valid email and a password of 8–128 characters.",
      );
    if (body.action === "signup") {
      const name = displayName(body.displayName);
      if (!name)
        throw new RequestError(
          400,
          "Use a public display name of 2–40 characters without HTML.",
        );
      const { data, error } = await db.auth.signUp({
        email: body.email.trim(),
        password: body.password,
        options: {
          data: { display_name: name },
          emailRedirectTo: `${new URL(request.url).origin}/auth/confirm`,
        },
      });
      if (error)
        throw new RequestError(
          error.status === 429 ? 429 : 400,
          "Could not create the account. Check your details or try again later.",
        );
      return json({ confirmationRequired: !data.session });
    }
    const { error } = await db.auth.signInWithPassword({
      email: body.email.trim(),
      password: body.password,
    });
    if (error)
      throw new RequestError(
        error.status === 429 ? 429 : 401,
        "Sign-in failed. Check your details and confirm your email.",
      );
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
