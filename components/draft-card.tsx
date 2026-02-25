"use client";

import { useState, useRef, useCallback } from "react";
import { ConfidenceMeter } from "@/components/confidence-meter";

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
  onAction?: (id: string, action: "approve" | "reject", editedContent?: string) => Promise<void>;
}

export function DraftCard({ draft, canAct, onAction }: DraftCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(draft.drafted_content);
  const [swipeX, setSwipeX] = useState(0);
  const touchStartX = useRef(0);
  const touchActive = useRef(false);

  const isPending = draft.status === "pending";
  const missingFooter = Boolean(draft.meta?.missing_epicon_footer);
  const confidenceLevel = (draft.meta?.confidence_level as string) || "medium";
  const wasEdited = editedContent !== draft.drafted_content;

  async function handleAction(action: "approve" | "reject") {
    if (!onAction) return;
    setActing(true);
    await onAction(draft.id, action, action === "approve" && wasEdited ? editedContent : undefined);
    setActing(false);
    setEditing(false);
  }

  // Swipe gesture handlers for pending drafts
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isPending || !canAct) return;
    touchStartX.current = e.touches[0].clientX;
    touchActive.current = true;
  }, [isPending, canAct]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchActive.current) return;
    const diff = e.touches[0].clientX - touchStartX.current;
    // Clamp swipe between -80 and 80
    setSwipeX(Math.max(-80, Math.min(80, diff)));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchActive.current) return;
    touchActive.current = false;
    if (swipeX > 60) {
      handleAction("approve");
    } else if (swipeX < -60) {
      handleAction("reject");
    }
    setSwipeX(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swipeX]);

  const swipeBg =
    swipeX > 30
      ? "bg-ok/10"
      : swipeX < -30
        ? "bg-fail/10"
        : "";

  return (
    <div
      className={`bg-surface border border-border rounded-xl overflow-hidden transition-colors ${swipeBg} animate-card-in`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: `translateX(${swipeX}px)`,
        transition: swipeX === 0 ? "transform 0.2s ease-out" : "none",
      }}
    >
      {/* Header tap area */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-surface2 text-left"
      >
        <code className="text-xs text-atlas font-semibold">{draft.id}</code>
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
          {/* Confidence Meter */}
          <ConfidenceMeter level={confidenceLevel} />

          {/* Metadata */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
            <span>{draft.created_at?.slice(0, 19)}</span>
            {draft.target_post_title && (
              <span>
                Target: <strong className="text-text">{draft.target_post_title}</strong>
              </span>
            )}
            {draft.target_author && <span>Author: {draft.target_author}</span>}
          </div>

          {/* "Why I wrote this" — structured self-report */}
          <div className="bg-atlas/5 border border-atlas/15 rounded-lg p-3 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-atlas font-semibold flex items-center gap-1.5">
              <span aria-hidden="true">⬡</span> Why I wrote this
            </p>
            <p className="text-xs text-text/80 leading-relaxed">
              {draft.prompt_context}
            </p>
            {draft.meta?.tone_target != null ? (
              <p className="text-[11px] text-dim">
                Tone target: <span className="text-text/70">{String(draft.meta.tone_target)}</span>
              </p>
            ) : null}
            {draft.meta?.uncertainty != null ? (
              <p className="text-[11px] text-warn/80">
                Uncertainty: {String(draft.meta.uncertainty)}
              </p>
            ) : null}
          </div>

          {/* Draft content — editable or read-only */}
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full text-xs bg-bg border border-atlas/30 rounded-lg p-3 whitespace-pre-wrap break-words min-h-32 max-h-64 overflow-y-auto leading-relaxed text-text resize-y focus:outline-none focus:border-atlas/60 transition-colors"
              />
              {wasEdited && (
                <p className="text-[10px] text-atlas">
                  Modified — will submit your edited version on approve
                </p>
              )}
            </div>
          ) : (
            <pre className="text-xs bg-bg border border-border rounded-lg p-3 whitespace-pre-wrap break-words max-h-64 overflow-y-auto leading-relaxed">
              {draft.drafted_content}
            </pre>
          )}

          {/* Actions */}
          {isPending && canAct && (
            <div className="space-y-2 pt-1">
              {/* Edit toggle */}
              <button
                onClick={() => {
                  setEditing(!editing);
                  if (!editing) setEditedContent(draft.drafted_content);
                }}
                className="w-full py-2 rounded-lg text-[11px] font-semibold border border-atlas/30 text-atlas bg-atlas/5 active:bg-atlas/15 transition-colors"
              >
                {editing ? "Cancel Edit" : "Edit Before Approve"}
              </button>

              {/* Approve / Reject */}
              <div className="flex gap-3">
                <button
                  disabled={acting}
                  onClick={() => handleAction("approve")}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-ok text-ok bg-ok/10 active:bg-ok/25 disabled:opacity-50 transition-colors"
                >
                  {acting ? "..." : wasEdited ? "Approve (edited)" : "Approve"}
                </button>
                <button
                  disabled={acting}
                  onClick={() => handleAction("reject")}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-fail text-fail bg-fail/10 active:bg-fail/25 disabled:opacity-50 transition-colors"
                >
                  {acting ? "..." : "Reject"}
                </button>
              </div>

              {/* Swipe hint */}
              <p className="text-[10px] text-dim/50 text-center">
                Swipe right to approve · left to reject
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
