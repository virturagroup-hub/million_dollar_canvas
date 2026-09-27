export const REPORT_CATEGORIES = {
  explicit: "Sexual or explicit content",
  hate: "Hateful content",
  harassment: "Harassment or threats",
  privacy: "Private information",
  illegal: "Illegal content",
  spam: "Malicious content or spam",
  other: "Other",
} as const;
export const MODERATION_CATEGORIES = {
  acceptable: "Acceptable",
  ...REPORT_CATEGORIES,
  minors: "Sexual content involving minors",
  evasion: "Moderation evasion",
} as const;
export type ModerationState =
  "pending" | "approved" | "rejected" | "suppressed";
export type SubmissionReceipt = { id: string; status: ModerationState };
export type QueueEntry = {
  id: string;
  status: ModerationState;
  display_name: string;
  canvas_title: string;
  created_at: string;
  report_count: number;
};
export type PatchStroke = {
  id: string;
  ordinal: number;
  points: { x: number; y: number }[];
  color: string;
  width: number;
};
export type ReviewDetail = {
  stroke: PatchStroke & {
    min_x: number;
    min_y: number;
    max_x: number;
    max_y: number;
    created_at: string;
    canvas_id: string;
  };
  status: ModerationState;
  displayName: string;
  canvasTitle: string;
  context: PatchStroke[];
  history: {
    id: string;
    previous_state: string;
    new_state: string;
    category: string;
    note: string;
    created_at: string;
  }[];
  reports: {
    id: string;
    category: string;
    description: string;
    status: string;
    created_at: string;
  }[];
};

// Future scanners append advisory signals; these are never transition commands.
export type ModerationSignal = {
  strokeId: string;
  result: "passed" | "flagged" | "uncertain";
  category?: string;
  confidence?: number;
  provider: string;
  patchReference: string;
  observedAt: string;
};
