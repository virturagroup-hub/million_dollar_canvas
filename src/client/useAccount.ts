"use client";
import { useCallback, useEffect, useState } from "react";
import type { PublicProfile } from "@/domain/canvas";
import { api } from "./api";
export function useAccount() {
  const [user, setUser] = useState<PublicProfile | null>(null);
  const [configured, setConfigured] = useState(false);
  const [authError, setAuthError] = useState("");
  const refreshUser = useCallback(async () => {
    try {
      const data = await api<{
        user: PublicProfile | null;
        configured: boolean;
      }>("/api/auth");
      setUser(data.user);
      setConfigured(data.configured);
      setAuthError("");
      return data.user;
    } catch (error) {
      setUser(null);
      setAuthError(
        error instanceof Error
          ? error.message
          : "Could not check your session.",
      );
      return null;
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refreshUser(), 0);
    return () => clearTimeout(timer);
  }, [refreshUser]);
  return { user, configured, authError, refreshUser };
}
