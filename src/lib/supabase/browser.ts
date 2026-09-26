"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicConfig } from "./config";
export function browserClient() {
  const config = publicConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return createBrowserClient(config.url, config.key);
}
