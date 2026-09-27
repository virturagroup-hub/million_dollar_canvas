export function authNotice(
  query: Record<string, string | string[] | undefined>,
) {
  return query.auth_error
    ? "That confirmation link could not be verified. Try signing in or request a fresh confirmation email."
    : query.confirmed === "1"
      ? "Email confirmed. You can sign in and add your first stroke."
      : "";
}
