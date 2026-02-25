"use client";

import { useState } from "react";

interface DraftCardProps {
  draft: {
    id: string;
    created_at: string;
    draft_type: string;
    target_post_title?: string;
    target_author?: string;
    prompt_context: string;
    drafted_content: string;
    status: string;
    meta: Record<string, unknown>;
  };
  canAct: boolean;
  onAction?: (id: string, action: "approve" | "reject") => Promise<void>;
}

export function DraftCard({ draft, canAct, onAction }: DraftCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);

  async function handleAction(action: "approve" | "reject") {
    if (!onAction) return;
    setActing(true);
    await onAction(draft.id, action);
    setActing(false);
  }

  const isPending = draft.status === "pending";
  const missingFooter = Boolean(draft.meta?.missing_epicon_footer);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-surface2 text-left"
      >
        <code className="text-xs text-accent">{draft.id}</code>
        <span className="text-[10px] uppercase text-dim font-semibold">
          {draft.draft_type}
        </span>
        {missingFooter && (
          <span className="text-[10px] uppercase font-bold text-fail bg-fail/15 px-1.5 py-0.5 rounded">
            No Footer
          </span>
        )}
        <span
          className={`ml-auto text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
            draft.status === "approved"
              ? "text-ok bg-ok/15"
              : draft.status === "rejected"
                ? "text-fail bg-fail/15"
                : "text-warn bg-warn/15"
          }`}
        >
          {draft.status}
        </span>
      </button>

      {expanded && (
        <div className="px-4 py-3 space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
            <span>{draft.created_at?.slice(0, 19)}</span>
            {draft.target_post_title && (
              <span>
                Target: <strong className="text-text">{draft.target_post_title}</strong>
              </span>
            )}
            {draft.target_author && <span>Author: {draft.target_author}</span>}
          </div>
          <p className="text-xs text-dim">Reason: {draft.prompt_context}</p>
          <pre className="text-xs bg-bg border border-border rounded-lg p-3 whitespace-pre-wrap break-words max-h-64 overflow-y-auto leading-relaxed">
            {draft.drafted_content}
          </pre>

          {isPending && canAct && (
            <div className="flex gap-3 pt-1">
              <button
                disabled={acting}
                onClick={() => handleAction("approve")}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-ok text-ok bg-ok/10 active:bg-ok/25 disabled:opacity-50 transition-colors"
              >
                {acting ? "..." : "Approve"}
              </button>
              <button
                disabled={acting}
                onClick={() => handleAction("reject")}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-fail text-fail bg-fail/10 active:bg-fail/25 disabled:opacity-50 transition-colors"
              >
                {acting ? "..." : "Reject"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
