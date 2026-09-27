import {
  API_LIMITS,
  type CanvasRecord,
  type PersistedStroke,
} from "@/domain/canvas";

export type ArtworkPage = {
  canvas: CanvasRecord;
  strokes: PersistedStroke[];
  next: number | null;
  reset?: boolean;
  resetVersion?: number;
};
export function mergeStrokes(
  previous: PersistedStroke[],
  incoming: PersistedStroke[],
  canvasId: string,
) {
  const byId = new Map(previous.map((stroke) => [stroke.id, stroke]));
  for (const stroke of incoming) {
    if (stroke.canvasId === canvasId && stroke.status === "approved")
      byId.set(stroke.id, stroke);
  }
  return [...byId.values()].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
}

// Cursor tracks completed canonical reads, NEVER local save responses. Advancing
// it to one's own save would skip another user's earlier, unseen stroke.
export class ArtworkStore {
  canvas: CanvasRecord | null = null;
  strokes: PersistedStroke[] = [];
  next: number | null = null;
  private cursor = 0;
  private resetVersion = 0;
  get epoch() {
    return this.resetVersion;
  }
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private read: (after: number, resetVersion: number) => Promise<ArtworkPage>,
    private publish: (store: ArtworkStore) => void,
    private limit: number = API_LIMITS.maxLoadedStrokes,
  ) {}
  add(stroke: PersistedStroke) {
    if (!this.canvas || stroke.canvasId !== this.canvas.id) return;
    this.strokes = mergeStrokes(this.strokes, [stroke], this.canvas.id);
    if (this.strokes.length > this.limit) {
      this.strokes = this.strokes.slice(0, this.limit);
      this.next = this.cursor;
    }
    this.publish(this);
  }
  async confirm(stroke: PersistedStroke, submissionEpoch: number) {
    // A delayed save response must not resurrect artwork removed by a newer
    // visibility snapshot. Rare epoch changes require a fresh bounded read.
    if (submissionEpoch !== this.resetVersion) await this.load(true, true);
    else this.add(stroke);
  }
  load(restart = false, drain = false) {
    const work = this.queue.then(async () => {
      if (restart) {
        this.cursor = 0;
        this.resetVersion = 0;
      }
      for (
        let pages = 0;
        pages < Math.ceil(this.limit / API_LIMITS.pageSize);
        pages++
      ) {
        const after = this.cursor;
        const data = await this.read(after, this.resetVersion);
        if (this.canvas && data.canvas.id !== this.canvas.id)
          throw new Error("Canvas changed. Reload artwork.");
        this.canvas = data.canvas;
        this.resetVersion = data.resetVersion ?? 0;
        const replace = restart || data.reset;
        const merged = mergeStrokes(
          replace ? [] : this.strokes,
          data.strokes,
          data.canvas.id,
        );
        this.strokes = merged.slice(0, this.limit);
        this.cursor = Math.min(
          data.strokes.at(-1)?.order ?? (replace ? 0 : after),
          this.strokes.at(-1)?.order ?? 0,
        );
        this.next = merged.length > this.limit ? this.cursor : data.next;
        this.publish(this);
        restart = false;
        if (!drain || data.next === null || this.strokes.length >= this.limit)
          break;
      }
    });
    this.queue = work.catch(() => {}); // A failed read must not poison later retries.
    return work;
  }
}
