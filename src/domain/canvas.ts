import type { Stroke } from "../drawing/model";
export type CanvasRecord = {
  id: string;
  slug: string;
  title: string;
  description: string;
  width: number;
  height: number;
  status: "draft" | "open" | "closed" | "archived";
  canvas_type: "flagship" | "community" | "special";
  stroke_limit: number | null;
  credit_cost: number | null;
  display_order: number;
  approved_count: number;
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
  previewStrokes: 500,
  catalogPageSize: 4,
} as const;
export function displayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length >= 2 &&
    name.length <= 40 &&
    !/[<>\u0000-\u001f\u007f]/.test(name)
    ? name
    : null;
}
