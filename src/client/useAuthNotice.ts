"use client";
import { useEffect, useState } from "react";
export function useAuthNotice(initial: string) {
  const [notice, setNotice] = useState(initial);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (
      url.searchParams.has("confirmed") ||
      url.searchParams.has("auth_error")
    ) {
      url.searchParams.delete("confirmed");
      url.searchParams.delete("auth_error");
      window.history.replaceState(window.history.state, "", url.href);
    }
    const timer = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timer);
  }, []);
  return [notice, () => setNotice("")] as const;
}
