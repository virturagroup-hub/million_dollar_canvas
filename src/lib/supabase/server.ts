import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicConfig } from "./config";
import { RequestError } from "@/server/submission";
// Used only by Route Handlers, where writing refreshed session cookies is supported.
export async function serverClient() {
  const config = publicConfig();
  if (!config)
    throw new RequestError(
      503,
      "Persistence is not configured. Follow the Supabase setup in README.",
    );
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value, options }) =>
          jar.set(name, value, options),
        );
      },
    },
  });
}
