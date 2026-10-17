"use client";

import { NotebookPenIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { addDisputeNote } from "@/app/(admin)/admin/disputes/actions";
import { TextArea } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";

/** Mirrors `MIN_DISPUTE_NOTE` on the server, which is the one that counts. */
const MIN_NOTE = 10;

/**
 * Adding to the record of a frozen deal.
 *
 * Only the side that raised a dispute gets to write when it is raised, so the
 * other side's account — from the deal's chat, or a phone call — has to be
 * written down by whoever heard it. That is what this is for, and why the hint
 * asks who said it and how.
 *
 * Collapsed by default: the decision below it is the thing most visits are
 * for, and an open text box on every case pushes the cases apart.
 */
export function AddDisputeNote({ orderId }: { orderId: string }) {
  const router = useRouter();
  const noteId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const short = note.trim().length < MIN_NOTE;

  if (!open) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setDone(null);
          }}
          aria-expanded={false}
          aria-controls={panelId}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3.5 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          <NotebookPenIcon aria-hidden="true" className="size-4" />
          Add to the record
        </button>
        {done ? (
          <output className="mt-2 block text-xs text-verified">{done}</output>
        ) : null}
      </div>
    );
  }

  return (
    <div
      id={panelId}
      className="mt-3 rounded-card border border-line bg-surface-2 p-3.5 sm:p-4"
    >
      <TextArea
        id={noteId}
        name="note"
        label="What you found, or what you were told"
        hint="Say who said it and how — “Seller, by WhatsApp: …”. Staff only: neither side sees it. It goes in the audit trail under your name and cannot be edited afterwards."
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        error={error ?? undefined}
        required
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={pending || short}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await addDisputeNote(orderId, note);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setNote("");
              setOpen(false);
              setDone(result.message);
              router.refresh();
            });
          }}
        >
          {pending ? "Adding…" : "Add to the record"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
        {note.trim().length > 0 && short ? (
          <span className="text-xs text-subtle">
            A few more words — this is the record.
          </span>
        ) : null}
      </div>
    </div>
  );
}
