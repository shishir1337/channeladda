import { MessagesSquareIcon } from "lucide-react";
import type { Metadata } from "next";
import { listThreads } from "@/server/messages";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

/**
 * The empty right-hand pane.
 *
 * The conversation list is in the layout, so this page is only ever what you
 * see before picking one. It says what the inbox is for rather than repeating
 * the list that is already on screen beside it.
 */
export default async function MessagesPage() {
  const user = await requireUser("/dashboard/messages");
  const threads = await listThreads(user);
  const waiting = threads.filter((thread) => thread.unread > 0).length;

  return (
    <div className="flex min-h-[20rem] flex-col items-center justify-center rounded-panel border border-dashed border-line bg-surface p-8 text-center">
      <MessagesSquareIcon aria-hidden="true" className="size-7 text-subtle" />
      <p className="mt-3 text-sm font-semibold text-fg">
        {threads.length === 0
          ? "No conversations yet"
          : waiting > 0
            ? `${waiting} ${waiting === 1 ? "conversation needs" : "conversations need"} a reply`
            : "Pick a conversation"}
      </p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
        {threads.length === 0
          ? "Ask a question on any listing and the thread starts here. Every conversation is readable by Channel Adda, which is what lets us settle a dispute on the record."
          : "Choose one from the list to read it and reply. Photos and clips are deleted after 48 hours, and a thread with no deal attached clears after 10 days."}
      </p>
    </div>
  );
}
