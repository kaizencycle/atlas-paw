export type AtlasLiveState = {
  suspended: boolean;
  suspension_reason: string | null;
  last_heartbeat: string | null;
  posts_today: number;
  comments_today: number;
  recent_confidence_levels: string[];
  posts_without_engagement: number;
};

export type AtlasAuditEntry = {
  timestamp: string;
  action: string;
  details: Record<string, unknown>;
};

export type AtlasLiveSnapshot = {
  mode: "full" | "readonly" | "checking";
  state: AtlasLiveState | null;
  auditTail: AtlasAuditEntry[];
  checkedAt: string;
};
