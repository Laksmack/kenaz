import React, { useState, useEffect, useCallback } from 'react';
import type { TaskComment } from '../../shared/types';
import { RichTextEditor, useRichEditorReset } from './RichTextEditor';

interface Props {
  taskId: string;
}

export function CommentSection({ taskId }: Props) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const { key: editorKey, reset: resetEditor } = useRichEditorReset();

  useEffect(() => {
    window.raido.getComments(taskId).then(setComments).catch(() => setComments([]));
  }, [taskId]);

  const submit = useCallback(async () => {
    const trimmed = draft.replace(/<p><\/p>/g, '').trim();
    if (!trimmed || trimmed === '<p></p>') return;
    const comment = await window.raido.addComment(taskId, draft);
    setComments(prev => [...prev, comment]);
    setDraft('');
    resetEditor();
    setComposing(false);
  }, [taskId, draft, resetEditor]);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    const updated = await window.raido.updateComment(editingId, editDraft);
    if (updated) {
      setComments(prev => prev.map(c => c.id === editingId ? updated : c));
    }
    setEditingId(null);
    setEditDraft('');
  }, [editingId, editDraft]);

  const deleteComment = useCallback(async (id: string) => {
    await window.raido.deleteComment(id);
    setComments(prev => prev.filter(c => c.id !== id));
  }, []);

  const formatTime = (iso: string) => {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="px-6 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-text-muted uppercase tracking-wider">
          Comments
          {comments.length > 0 && <span className="ml-1 normal-case tracking-normal">({comments.length})</span>}
        </span>
        {!composing && (
          <button
            onClick={() => setComposing(true)}
            className="text-[10px] flex items-center gap-0.5 text-text-muted hover:text-accent-primary transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span>Add</span>
          </button>
        )}
      </div>

      {/* Comment list */}
      {comments.length > 0 && (
        <div className="space-y-3 mb-3">
          {comments.map(comment => (
            <div key={comment.id} className="group">
              {editingId === comment.id ? (
                <div className="space-y-2">
                  <RichTextEditor
                    content={editDraft}
                    onChange={setEditDraft}
                    placeholder="Edit comment..."
                    autoFocus
                    onSubmit={saveEdit}
                    minHeight="60px"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={saveEdit}
                      className="text-[10px] px-2.5 py-1 bg-accent-primary text-white rounded font-medium hover:bg-accent-primary/80 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setEditDraft(''); }}
                      className="text-[10px] px-2.5 py-1 text-text-muted hover:text-text-secondary transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border-subtle bg-bg-secondary/30 px-3 py-2">
                  <div className="prose-raido text-xs" dangerouslySetInnerHTML={{ __html: comment.body_html }} />
                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-border-subtle/50">
                    <span className="text-[10px] text-text-muted">{formatTime(comment.created_at)}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditingId(comment.id); setEditDraft(comment.body_html); }}
                        className="text-[10px] text-text-muted hover:text-accent-primary transition-colors px-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteComment(comment.id)}
                        className="text-[10px] text-text-muted hover:text-accent-danger transition-colors px-1"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Compose area */}
      {composing && (
        <div className="space-y-2">
          <RichTextEditor
            key={editorKey}
            content={draft}
            onChange={setDraft}
            placeholder="Write a comment... (Cmd+Enter to submit)"
            autoFocus
            onSubmit={submit}
            minHeight="60px"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={submit}
              className="text-[10px] px-2.5 py-1 bg-accent-primary text-white rounded font-medium hover:bg-accent-primary/80 transition-colors"
            >
              Comment
            </button>
            <button
              onClick={() => { setComposing(false); setDraft(''); }}
              className="text-[10px] px-2.5 py-1 text-text-muted hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
            <span className="text-[9px] text-text-muted ml-auto">Cmd+Enter to submit</span>
          </div>
        </div>
      )}
    </div>
  );
}
