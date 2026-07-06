'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Annotation, AnnotationCreate, Note } from '../../lib/types';
import { HIGHLIGHT_COLORS } from '../../lib/highlightColors';
import { CommentComposer } from './CommentComposer';

// Width of an expanded card; the collapsed pins are much narrower and sit in the gutter.
const CARD_WIDTH = 288;
const PIN_STACK_GAP = 6;
const PIN_HEIGHT = 28;
const MARK_TOOLBAR_W = 176;

type AskStatus = Record<string, { state: 'pending' } | { state: 'failed'; message: string }>;
type Placement = { left: number; cardLeft: number; items: Array<{ ann: Annotation; top: number }> };
type MarkMenu = { ann: Annotation; x: number; y: number };
type Composing = { source: Annotation; top: number; left: number };

function firstId(value: string | null | undefined): string | null {
  return value ? (value.split(/\s+/)[0] ?? null) : null;
}

/**
 * Google-Docs-style floating annotations beside the text. Comments AND anchored asks render as
 * collapsed gutter pins (💬 / ❓) that expand into a card: a comment card offers edit/delete; an ask
 * card shows the question with its grounded answer (the note linked via annotation_id), or the
 * in-flight/failed state. Clicking a highlight opens a small toolbar to recolor, comment/ask on, or
 * delete it.
 *
 * Anchoring reuses the `data-annotation-ids` attribute already set on markdown `<mark>`s and PDF
 * overlay boxes. PDF overlay boxes are `pointer-events:none` (so they never block text selection), so
 * clicks on the PDF surface are hit-tested against the painted boxes by coordinate instead.
 */
export function CommentLayer({
  annotations,
  notes,
  askStatus,
  askDisabledReason,
  onCreate,
  onUpdate,
  onDelete,
}: {
  annotations: Annotation[];
  notes: Note[];
  askStatus: AskStatus;
  askDisabledReason?: string | null;
  onCreate: (payload: AnnotationCreate) => void;
  onUpdate: (id: string, patch: { body?: string; color?: string | null }) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [markMenu, setMarkMenu] = useState<MarkMenu | null>(null);
  const [composing, setComposing] = useState<Composing | null>(null);
  const rafRef = useRef(0);

  const pinned = annotations.filter((a) => a.type === 'comment' || a.type === 'ask_anchor');
  // Stable identity for the measure effect: reruns when the pinned set or anchors change.
  const pinSignature = pinned
    .map((a) => `${a.id}:${a.start_offset}:${a.end_offset}:${a.pdf_anchor?.rects.length ?? 0}`)
    .join('|');

  const measure = useCallback(() => {
    const canvas = document.querySelector<HTMLElement>('.reader-canvas');
    if (!canvas) {
      setPlacement(null);
      return;
    }
    const canvasRect = canvas.getBoundingClientRect();
    const docEl =
      canvas.querySelector<HTMLElement>('.reader-markdown') ||
      canvas.querySelector<HTMLElement>('.pdf-viewer-page-canvas');
    const docRight = docEl ? docEl.getBoundingClientRect().right : canvasRect.left;
    const left = Math.min(docRight + 8, canvasRect.right - 32);
    const cardLeft = Math.max(8, Math.min(docRight + 8, canvasRect.right - CARD_WIDTH - 8));

    const raw: Array<{ ann: Annotation; top: number }> = [];
    for (const ann of pinned) {
      const el = document.querySelector<HTMLElement>(`[data-annotation-ids~="${ann.id}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom < canvasRect.top || r.top > canvasRect.bottom) continue; // outside the viewport band
      raw.push({ ann, top: r.top });
    }
    raw.sort((a, b) => a.top - b.top);
    let prevBottom = -Infinity;
    for (const item of raw) {
      if (item.top < prevBottom + PIN_STACK_GAP) item.top = prevBottom + PIN_STACK_GAP;
      prevBottom = item.top + PIN_HEIGHT;
    }
    setPlacement({ left, cardLeft, items: raw });
    // `pinned` is re-derived each render; pinSignature captures the changes that matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinSignature]);

  useEffect(() => {
    const schedule = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    measure();
    schedule(); // second pass catches marks painted asynchronously after this render
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    // Re-measure once the reader (re)paints its marks — markdown and PDF each signal after painting.
    document.addEventListener('pdf-annotations-painted', schedule as EventListener);
    document.addEventListener('reader-marks-painted', schedule as EventListener);
    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('pdf-annotations-painted', schedule as EventListener);
      document.removeEventListener('reader-marks-painted', schedule as EventListener);
    };
  }, [measure]);

  // Open a card / highlight toolbar from a click on the document surface.
  useEffect(() => {
    const canvas = document.querySelector<HTMLElement>('.reader-canvas');
    if (!canvas) return;
    const byId = new Map(annotations.map((a) => [a.id, a]));
    const onClick = (event: MouseEvent) => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return; // this was a drag-select, not a click

      let id = firstId(
        (event.target as HTMLElement).closest?.('[data-annotation-ids]')
          ?.getAttribute('data-annotation-ids'),
      );
      if (!id) {
        // PDF overlay boxes are click-through — hit-test the painted boxes by coordinate.
        const boxes = canvas.querySelectorAll<HTMLElement>('.pdf-annotation[data-annotation-ids]');
        for (const box of boxes) {
          const r = box.getBoundingClientRect();
          if (
            event.clientX >= r.left &&
            event.clientX <= r.right &&
            event.clientY >= r.top &&
            event.clientY <= r.bottom
          ) {
            id = firstId(box.getAttribute('data-annotation-ids'));
            if (id) break;
          }
        }
      }

      if (!id) {
        setActiveId(null);
        setMarkMenu(null);
        setComposing(null);
        return;
      }
      const ann = byId.get(id);
      if (!ann) return;
      if (ann.type === 'comment' || ann.type === 'ask_anchor') {
        setActiveId((prev) => (prev === id ? null : id));
        setEditingId(null);
        setMarkMenu(null);
      } else {
        setMarkMenu({ ann, x: event.clientX, y: event.clientY });
        setActiveId(null);
      }
    };
    canvas.addEventListener('click', onClick);
    return () => canvas.removeEventListener('click', onClick);
  }, [annotations]);

  if (!placement) return null;

  const beginEdit = (ann: Annotation) => {
    setEditingId(ann.id);
    setDraft(ann.body ?? '');
  };
  const saveEdit = (id: string) => {
    const body = draft.trim();
    if (body) void onUpdate(id, { body });
    setEditingId(null);
  };

  const markToolbarLeft = markMenu
    ? markMenu.x + 8 + MARK_TOOLBAR_W <= window.innerWidth - 8
      ? markMenu.x + 8
      : Math.max(8, markMenu.x - MARK_TOOLBAR_W - 8)
    : 0;

  return (
    <div className="comment-layer">
      {placement.items.map(({ ann, top }) => {
        const isAsk = ann.type === 'ask_anchor';
        const active = ann.id === activeId;
        if (!active) {
          return (
            <button
              key={ann.id}
              type="button"
              className={`comment-pin${isAsk ? ' ask' : ''}`}
              style={{ position: 'fixed', top, left: placement.left, zIndex: 40 }}
              title={ann.body ?? (isAsk ? 'Question' : 'Comment')}
              onClick={() => {
                setActiveId(ann.id);
                setEditingId(null);
                setMarkMenu(null);
              }}
            >
              {isAsk ? '❓' : '💬'}
            </button>
          );
        }

        const answerNote = isAsk ? notes.find((n) => n.annotation_id === ann.id) : undefined;
        const status = askStatus[ann.id];
        return (
          <div
            key={ann.id}
            className={`comment-card${isAsk ? ' ask' : ''}`}
            style={{ position: 'fixed', top, left: placement.cardLeft, width: CARD_WIDTH, zIndex: 45 }}
          >
            {ann.quote ? <blockquote className="comment-card-quote">{ann.quote}</blockquote> : null}
            {isAsk ? (
              <>
                <p className="comment-card-question">{ann.body}</p>
                {answerNote ? (
                  <p className="comment-card-body comment-card-answer">{answerNote.body}</p>
                ) : status?.state === 'pending' ? (
                  <p className="comment-card-body muted">Asking…</p>
                ) : status?.state === 'failed' ? (
                  <p className="comment-card-body comment-card-failed">{status.message}</p>
                ) : (
                  <p className="comment-card-body muted">No answer was saved for this question.</p>
                )}
                <div className="comment-card-actions">
                  <button type="button" className="text-button" onClick={() => setActiveId(null)}>
                    Close
                  </button>
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() => {
                      void onDelete(ann.id);
                      setActiveId(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </>
            ) : editingId === ann.id ? (
              <>
                <textarea
                  className="comment-card-input"
                  value={draft}
                  rows={3}
                  autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingId(null);
                    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      saveEdit(ann.id);
                    }
                  }}
                />
                <div className="comment-card-actions">
                  <button type="button" className="text-button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!draft.trim()}
                    onClick={() => saveEdit(ann.id)}
                  >
                    Save
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="comment-card-body">{ann.body}</p>
                <div className="comment-card-actions">
                  <button type="button" className="text-button" onClick={() => setActiveId(null)}>
                    Close
                  </button>
                  <button type="button" className="text-button" onClick={() => beginEdit(ann)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() => {
                      void onDelete(ann.id);
                      setActiveId(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {markMenu ? (
        <div
          className="selection-toolbar"
          role="toolbar"
          aria-label="Highlight actions"
          style={{
            position: 'fixed',
            top: Math.max(8, Math.min(markMenu.y, window.innerHeight - 120)),
            left: markToolbarLeft,
            zIndex: 50,
          }}
        >
          <div className="swatch-row" role="group" aria-label="Highlight color">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`swatch${(markMenu.ann.color ?? 'yellow') === c.key ? ' active' : ''}`}
                style={{ background: c.swatch }}
                aria-label={`Recolor ${c.label}`}
                title={`Recolor ${c.label}`}
                onClick={() => {
                  void onUpdate(markMenu.ann.id, { color: c.key });
                  setMarkMenu((prev) => (prev ? { ...prev, ann: { ...prev.ann, color: c.key } } : prev));
                }}
              />
            ))}
          </div>
          <div className="selection-toolbar-actions">
            <button
              type="button"
              className="selection-toolbar-button"
              onClick={() => {
                setComposing({ source: markMenu.ann, top: markMenu.y, left: markToolbarLeft });
                setMarkMenu(null);
              }}
            >
              Comment / Ask
            </button>
            <button
              type="button"
              className="selection-toolbar-button danger"
              onClick={() => {
                void onDelete(markMenu.ann.id);
                setMarkMenu(null);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}

      {composing ? (
        <CommentComposer
          quote={composing.source.quote}
          top={Math.min(composing.top, window.innerHeight - 180)}
          left={Math.max(8, Math.min(composing.left, window.innerWidth - 320))}
          askDisabledReason={askDisabledReason}
          onSave={(body) => {
            const s = composing.source;
            onCreate({
              type: 'comment',
              quote: s.quote,
              body,
              color: null,
              start_offset: s.start_offset,
              end_offset: s.end_offset,
              page: s.page,
              pdf_anchor: s.pdf_anchor,
            });
            setComposing(null);
          }}
          onAsk={(question) => {
            const s = composing.source;
            onCreate({
              type: 'ask_anchor',
              quote: s.quote,
              body: question,
              color: null,
              start_offset: s.start_offset,
              end_offset: s.end_offset,
              page: s.page,
              pdf_anchor: s.pdf_anchor,
            });
            setComposing(null);
          }}
          onCancel={() => setComposing(null)}
        />
      ) : null}
    </div>
  );
}
