import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicConfig } from "./lib/supabase/config";
export async function proxy(request: NextRequest) {
  const config = publicConfig();
  let response = NextResponse.next({ request });
  if (!config) return response;
  const client = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values, headers) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        if (headers)
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
      },
    },
  });
  // Refresh cookies here; each mutation independently verifies a live Auth user.
  await client.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/api/:path*", "/auth/:path*"] };
