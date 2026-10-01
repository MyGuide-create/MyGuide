"use client";

import { useState, useTransition } from "react";
import type { PublicUser } from "@/lib/auth";
import { addPlaceComment, deletePlaceComment, editPlaceComment } from "@/lib/actions/comments";
import type { PlaceComment } from "@/lib/db/schema";
import { timeAgo } from "@/lib/utils";
import { ChatIcon, EditIcon, TrashIcon } from "./Icons";
import { Avatar, Spinner, cx } from "./ui";

interface Row {
  comment: PlaceComment;
  author: PublicUser;
}

/** Comment thread on a single place — visible to anyone who can already see the guide. */
export function PlaceComments({ placeId, initial, currentUser }: { placeId: string; initial: Row[]; currentUser: PublicUser | null }) {
  const [rows, setRows] = useState(initial);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(initial.length > 0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const post = () => {
    const body = text.trim();
    if (!body || !currentUser) return;
    setError(null);
    const optimistic: Row = {
      comment: { id: `pending-${Date.now()}`, placeId, authorId: currentUser.id, body, createdAt: new Date(), editedAt: null },
      author: currentUser,
    };
    setRows((r) => [...r, optimistic]);
    setText("");
    setOpen(true);
    start(async () => {
      try {
        await addPlaceComment(placeId, body);
      } catch (e) {
        setRows((r) => r.filter((row) => row.comment.id !== optimistic.comment.id));
        setError(e instanceof Error ? e.message : "Couldn't post that comment.");
      }
    });
  };

  const remove = (commentId: string) => {
    setRows((r) => r.filter((row) => row.comment.id !== commentId));
    start(async () => {
      await deletePlaceComment(commentId);
    });
  };

  const startEdit = (row: Row) => {
    setEditingId(row.comment.id);
    setEditText(row.comment.body);
  };

  const saveEdit = (commentId: string) => {
    const body = editText.trim();
    if (!body) return;
    const prevRows = rows;
    setRows((r) => r.map((row) => (row.comment.id === commentId ? { ...row, comment: { ...row.comment, body, editedAt: new Date() } } : row)));
    setEditingId(null);
    start(async () => {
      try {
        await editPlaceComment(commentId, body);
      } catch (e) {
        setRows(prevRows);
        setError(e instanceof Error ? e.message : "Couldn't save that edit.");
      }
    });
  };

  return (
    <div className="mt-2">
      {!open && rows.length === 0 && currentUser && (
        <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-ink-muted inline-flex items-center gap-1 hover:text-terracotta">
          <ChatIcon size={12} /> Add a comment
        </button>
      )}
      {rows.length > 0 && !open && (
        <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-ink-muted inline-flex items-center gap-1 hover:text-terracotta">
          <ChatIcon size={12} /> {rows.length} comment{rows.length === 1 ? "" : "s"}
        </button>
      )}
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {rows.map((row) => {
            const editing = editingId === row.comment.id;
            const isPending = row.comment.id.startsWith("pending-");
            const isMine = currentUser?.id === row.author.id;
            return (
              <div key={row.comment.id} className="flex items-start gap-2">
                <Avatar user={row.author} size={22} />
                <div className="flex-1 min-w-0 rounded-2xl bg-cream-deep/50 px-2.5 py-1.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11.5px] font-semibold">{row.author.displayName}</span>
                    <span className="text-[10.5px] text-ink-faint">{timeAgo(row.comment.createdAt)}{row.comment.editedAt ? " · edited" : ""}</span>
                  </div>
                  {editing ? (
                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); saveEdit(row.comment.id); }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        className="flex-1 min-w-0 rounded-full border border-line bg-paper px-2.5 py-1 text-[12.5px] outline-none focus:border-terracotta-soft"
                      />
                      <button type="button" onClick={() => saveEdit(row.comment.id)} disabled={!editText.trim()} className="text-[11.5px] font-medium text-terracotta shrink-0">Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-[11.5px] text-ink-muted shrink-0">Cancel</button>
                    </div>
                  ) : (
                    <p className="text-[12.5px] leading-snug">{row.comment.body}</p>
                  )}
                </div>
                {isMine && !isPending && !editing && (
                  <div className="flex flex-col gap-1 mt-1">
                    <button type="button" aria-label="Edit comment" onClick={() => startEdit(row)} className="text-ink-faint hover:text-terracotta p-1">
                      <EditIcon size={12} />
                    </button>
                    <button type="button" aria-label="Delete comment" onClick={() => remove(row.comment.id)} className="text-ink-faint hover:text-danger p-1">
                      <TrashIcon size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {currentUser ? (
            <div className="flex items-center gap-2 mt-0.5">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); post(); } }}
                placeholder="Add a comment…"
                className="flex-1 min-w-0 rounded-full border border-line bg-paper px-3 py-1.5 text-[12.5px] outline-none focus:border-terracotta-soft"
              />
              <button type="button" onClick={post} disabled={!text.trim() || pending} className={cx("text-[12px] font-medium shrink-0", text.trim() ? "text-terracotta" : "text-ink-faint")}>
                {pending ? <Spinner className="w-3.5 h-3.5" /> : "Post"}
              </button>
            </div>
          ) : null}
          {error && <p className="text-[11px] text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
