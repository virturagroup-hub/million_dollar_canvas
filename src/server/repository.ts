import "server-only";
import { serverClient } from "@/lib/supabase/server";
import type { Candidate, CanvasRecord, PersistedStroke } from "@/domain/canvas";
import { API_LIMITS } from "@/domain/canvas";
import { RequestError, type SubmissionStore } from "./submission";
import type { Point } from "@/drawing/model";
type StrokeRow = {
  id: string;
  ordinal: number;
  canvas_id: string;
  points: Point[];
  color: string;
  width: number;
  duration: number;
  created_at: string;
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
  profiles: { id: string; display_name: string };
  stroke_visibility: { status: string };
};
const fields =
  "id,ordinal,canvas_id,points,color,width,duration,created_at,min_x,min_y,max_x,max_y,profiles!inner(id,display_name),stroke_visibility!inner(status)";
export function fromRow(row: StrokeRow): PersistedStroke {
  return {
    id: row.id,
    order: row.ordinal,
    canvasId: row.canvas_id,
    points: row.points,
    color: row.color,
    width: row.width,
    duration: row.duration,
    createdAt: row.created_at,
    bounds: {
      minX: row.min_x,
      minY: row.min_y,
      maxX: row.max_x,
      maxY: row.max_y,
    },
    author: { id: row.profiles.id, displayName: row.profiles.display_name },
    status: "approved",
  };
}
export async function repository() {
  const db = await serverClient();
  async function canvas(
    value: string,
    column = "id",
  ): Promise<CanvasRecord | null> {
    const { data, error } = await db
      .from("canvases")
      .select(
        "id,slug,title,description,width,height,status,opens_at,closes_at",
      )
      .eq(column, value)
      .neq("status", "draft")
      .maybeSingle();
    if (error)
      throw new RequestError(
        503,
        "Could not load the canvas. Check Supabase configuration and migrations.",
      );
    return data;
  }
  async function save(userId: string, c: CanvasRecord, candidate: Candidate) {
    const { data: id, error } = await db.rpc("submit_stroke", {
      p_canvas_id: c.id,
      p_request_id: candidate.requestId,
      p_points: candidate.points,
      p_color: candidate.color,
      p_width: candidate.width,
      p_duration: candidate.duration,
    });
    if (error) {
      if (error.message.includes("rate limit"))
        throw new RequestError(
          429,
          "Please wait a minute before adding another stroke.",
        );
      if (error.message.includes("closed"))
        throw new RequestError(409, "This canvas is closed.");
      if (error.message.includes("conflict"))
        throw new RequestError(409, "This submission ID was already used.");
      throw new RequestError(
        503,
        "The stroke was not confirmed. Retry the same stroke or reload to check the artwork.",
      );
    }
    const { data, error: readError } = await db
      .from("strokes")
      .select(fields)
      .eq("id", id)
      .eq("user_id", userId)
      .eq("stroke_visibility.status", "approved")
      .single();
    if (readError || !data)
      throw new RequestError(
        503,
        "Could not confirm the saved stroke. Retry the same stroke to check it safely.",
      );
    return fromRow(data as unknown as StrokeRow);
  }
  async function page(canvasId: string, after: number, resetVersion = 0) {
    // Read the epoch BEFORE the page. A concurrent visibility change is then
    // detected by the next reconciliation rather than silently acknowledged.
    const { data: revision, error: revisionError } = await db
      .from("canvas_updates")
      .select("reset_version")
      .eq("canvas_id", canvasId)
      .single();
    if (revisionError || !revision)
      throw new RequestError(
        503,
        "Could not check artwork updates. Check migrations and retry.",
      );
    const reset = revision.reset_version !== resetVersion;
    const { data, error } = await db
      .from("strokes")
      .select(fields)
      .eq("canvas_id", canvasId)
      .eq("stroke_visibility.status", "approved")
      .gt("ordinal", reset ? 0 : after)
      .order("ordinal")
      .limit(API_LIMITS.pageSize + 1);
    if (error)
      throw new RequestError(503, "Could not load artwork. Please retry.");
    const rows = data as unknown as StrokeRow[];
    const hasMore = rows.length > API_LIMITS.pageSize;
    const strokes = rows.slice(0, API_LIMITS.pageSize).map(fromRow);
    return {
      strokes,
      next: hasMore ? strokes.at(-1)!.order : null,
      reset,
      resetVersion: revision.reset_version,
    };
  }
  return { canvas, save, page } satisfies SubmissionStore & {
    page: typeof page;
  };
}
