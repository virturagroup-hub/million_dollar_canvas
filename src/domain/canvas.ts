import type { Stroke } from "../drawing/model";
export type CanvasRecord = {
  id: string;
  slug: string;
  title: string;
  description: string;
  width: number;
  height: number;
  status: "draft" | "open" | "closed" | "archived";
  opens_at: string | null;
  closes_at: string | null;
};
export type PublicProfile = { id: string; displayName: string };
export type PersistedStroke = Stroke & {
  canvasId: string;
  order: number;
  author: PublicProfile;
  status: "approved";
};
export type Candidate = Pick<
  Stroke,
  "points" | "color" | "width" | "duration"
> & { requestId: string };
export const API_LIMITS = {
  payloadBytes: 160000,
  pageSize: 100,
  maxLoadedStrokes: 2000,
} as const;
export const DEFAULT_SLUG = "open-studio";
export function displayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length >= 2 &&
    name.length <= 40 &&
    !/[<>\u0000-\u001f\u007f]/.test(name)
    ? name
    : null;
}
