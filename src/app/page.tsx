import Studio from "@/components/Studio";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const notice = query.auth_error
    ? "That confirmation link could not be verified. Try signing in or request a fresh confirmation email."
    : query.confirmed === "1"
      ? "Email confirmed. You can sign in and add your first stroke."
      : "";
  return <Studio notice={notice} />;
}
