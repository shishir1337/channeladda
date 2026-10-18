"use client";

import {
  ImageIcon,
  Loader2Icon,
  RotateCcwIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type UploadKind = "cover" | "avatar" | "proof";

const MAX_MB = 8;
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const ACCEPT = TYPES.join(",");

/** What the caller gets back once a file is stored. */
export type Uploaded = { url: string; sha256: string };

/**
 * Sends one file and reports how much of it has gone.
 *
 * XMLHttpRequest rather than fetch, because fetch still cannot report upload
 * progress, and eight 8MB screenshots over a phone connection is a long time
 * to look at a spinner that says nothing. Same origin, so the session cookie
 * goes with it exactly as it did with fetch.
 */
function send(
  file: File,
  kind: UploadKind,
  onProgress: (fraction: number) => void,
): Promise<Uploaded> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.set("kind", kind);
    body.set("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let data: { url?: string; sha256?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // A proxy's HTML error page. The status below says it failed.
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.url && data.sha256) {
        resolve({ url: data.url, sha256: data.sha256 });
      } else {
        reject(
          new Error(data.error ?? "That upload did not go through. Try again."),
        );
      }
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "The connection dropped before that file arrived. Try again.",
        ),
      );
    xhr.send(body);
  });
}

/**
 * Checked again on the server, which reads the file's own bytes; this is only
 * so an obvious no is heard at once. A browser that reports no type at all is
 * left to the server rather than refused here, since the bytes may be fine.
 */
function refusal(file: File): string | null {
  if (file.type && !TYPES.includes(file.type)) {
    return "That is not a PNG, JPEG, WebP or GIF image.";
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_MB}MB.`;
  }
  return null;
}

type Item = {
  id: number;
  name: string;
  file: File;
  state: "waiting" | "sending" | "failed";
  /** 0 to 1. */
  progress: number;
  error: string | null;
  /** False for a file refused before sending: trying it again changes nothing. */
  retryable: boolean;
};

/**
 * An image, or several, with a preview.
 *
 * Files are sent as soon as they are chosen rather than on form submit, so a
 * slow upload does not sit between the person and the button they pressed.
 * In single mode `value` is the stored URL and is what the surrounding form
 * should submit.
 *
 * With `multiple`, one pick can carry several files: they go up one after
 * another, each with its own progress, and `onChange` is called once for each
 * file as it lands. A seller adding eight proof screenshots used to open the
 * picker eight times. Because those calls arrive from one pick, the caller
 * must update with a function of its current state rather than the state it
 * rendered with — otherwise each file overwrites the one before it.
 */
export function ImageUpload({
  kind,
  value,
  onChange,
  label,
  hint,
  error,
  multiple = false,
  maxFiles,
  className,
  aspect = "wide",
}: {
  kind: UploadKind;
  value: string | null;
  /**
   * Called with the stored file, or null when it is cleared. The hash comes
   * along because proof screenshots are recorded by content — the same image
   * appearing under two sellers is a signal worth keeping.
   */
  onChange: (url: string | null, file: Uploaded | null) => void;
  label: string;
  hint?: string;
  /**
   * A message from the surrounding form about this field — "Add a cover
   * image" — rendered here so it sits by the control it is about and is read
   * out with it.
   */
  error?: string;
  /** Let one pick carry several files. Each still arrives on its own. */
  multiple?: boolean;
  /**
   * How many more files may be added from here. Anything picked beyond it is
   * left out, and the person is told which. Defaults to one, or to no limit
   * with `multiple`.
   */
  maxFiles?: number;
  className?: string;
  aspect?: "wide" | "square";
}) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [items, setItems] = useState<Item[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const limit = maxFiles ?? (multiple ? Number.POSITIVE_INFINITY : 1);
  const active = items.filter((i) => i.state !== "failed");
  const busy = active.length > 0;
  const sending = items.find((i) => i.state === "sending");

  const patch = (id: number, change: Partial<Item>) =>
    setItems((list) =>
      list.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );

  async function upload(item: Item) {
    patch(item.id, { state: "sending", progress: 0, error: null });
    try {
      const stored = await send(item.file, kind, (progress) =>
        patch(item.id, { progress }),
      );
      // In single mode the new picture replaces whatever failed before it,
      // so an old failure is not left listed under the preview.
      setItems((list) =>
        multiple ? list.filter((i) => i.id !== item.id) : [],
      );
      onChange(stored.url, stored);
    } catch (e) {
      patch(item.id, {
        state: "failed",
        error:
          e instanceof Error ? e.message : "That upload did not go through.",
      });
    }
  }

  async function accept(list: FileList | null | undefined) {
    const picked = Array.from(list ?? []);
    // Let the same file be picked again after a failure.
    if (inputRef.current) inputRef.current.value = "";
    if (picked.length === 0) return;
    setNotice(null);

    const chosen = multiple ? picked : picked.slice(0, 1);
    const refused: Item[] = [];
    const fine: Item[] = [];
    for (const file of chosen) {
      const reason = refusal(file);
      const item: Item = {
        id: ++seq.current,
        name: file.name,
        file,
        state: reason ? "failed" : "waiting",
        progress: 0,
        error: reason,
        retryable: reason === null,
      };
      (reason ? refused : fine).push(item);
    }

    const room = Math.max(0, limit - active.length);
    const queued = fine.slice(0, room);
    if (fine.length > queued.length) {
      setNotice(
        room === 0
          ? "There is no room for more. Remove one to add another."
          : `You picked ${fine.length}, and there is room for ${room}. The first ${room === 1 ? "one is" : `${room} are`} going up; pick the rest after removing some.`,
      );
    }

    // Earlier failures stay listed until dismissed: they are the only
    // record of which files did not make it.
    setItems((current) => [...current, ...refused, ...queued]);

    // One at a time. They share one connection's upload bandwidth, so in
    // parallel they would each crawl and all finish at the end; in turn,
    // each appears as soon as it lands.
    for (const item of queued) {
      await upload(item);
    }
  }

  const describedBy =
    [
      hint ? hintId : null,
      error ? errorId : null,
      items.length ? statusId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={className}>
      <p className="block text-[0.8125rem] font-medium text-fg">{label}</p>
      {hint ? (
        <p id={hintId} className="mt-1 text-xs leading-relaxed text-subtle">
          {hint}
        </p>
      ) : null}

      {value && !multiple ? (
        <div className="mt-1.5 flex items-start gap-3">
          {/* biome-ignore lint/performance/noImgElement: a preview of a file the
              person just picked. next/image would round-trip their own upload
              through the optimiser to render a thumbnail. Dimensions are set,
              so there is no layout shift. */}
          <img
            src={value}
            alt=""
            width={aspect === "square" ? 80 : 144}
            height={80}
            className={cn(
              "rounded-lg border border-line object-cover shadow-xs",
              aspect === "square" ? "size-20" : "h-20 w-36",
            )}
          />
          <button
            type="button"
            onClick={() => {
              onChange(null, null);
              setItems([]);
              setNotice(null);
            }}
            className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[0.8125rem] font-medium text-muted shadow-xs transition-colors duration-150 pointer-fine:h-8 pointer-fine:px-2.5 hover:border-danger/40 hover:text-danger dark:bg-surface-2"
          >
            <TrashIcon aria-hidden="true" className="size-3.5" />
            Remove
            <span className="sr-only"> {label.toLowerCase()}</span>
          </button>
        </div>
      ) : (
        <>
          <label
            htmlFor={inputId}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!busy) void accept(e.dataTransfer.files);
            }}
            className={cn(
              "group mt-1.5 flex min-h-[6.5rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition-colors duration-150",
              busy ? "cursor-progress" : "cursor-pointer",
              dragging
                ? "border-primary bg-primary-soft/60"
                : "border-line-strong bg-surface hover:border-fg/25 hover:bg-surface-2/50 dark:bg-surface-2/40",
              error && "border-danger",
            )}
          >
            {busy ? (
              <>
                <Loader2Icon
                  aria-hidden="true"
                  className="size-4 animate-spin text-muted"
                />
                <span className="text-[0.8125rem] text-muted">
                  {multiple && active.length > 1
                    ? `Uploading — ${active.length} to go…`
                    : "Uploading…"}
                </span>
              </>
            ) : (
              <>
                <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-muted shadow-xs transition-transform duration-150 group-hover:-translate-y-0.5 dark:bg-surface-2">
                  {aspect === "square" ? (
                    <ImageIcon aria-hidden="true" className="size-4" />
                  ) : (
                    <UploadIcon aria-hidden="true" className="size-4" />
                  )}
                </span>
                <span className="text-[0.8125rem] text-muted">
                  <span className="font-medium text-fg underline decoration-line-strong underline-offset-4">
                    {multiple ? "Choose files" : "Choose a file"}
                  </span>{" "}
                  {multiple ? "or drag them here" : "or drag it here"}
                </span>
                <span className="text-xs text-subtle">
                  PNG, JPEG, WebP or GIF · up to {MAX_MB}MB
                  {multiple ? " each" : ""}
                </span>
              </>
            )}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            multiple={multiple}
            disabled={busy}
            aria-label={label}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className="sr-only"
            onChange={(e) => void accept(e.target.files)}
          />
        </>
      )}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 text-[0.8125rem] text-danger"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <output className="mt-1.5 block text-[0.8125rem] text-muted">
          {notice}
        </output>
      ) : null}

      {items.length > 0 ? (
        <div id={statusId} className="mt-3">
          {/* What a screen reader hears as the queue moves. The rows below
              carry the same thing for everyone else. */}
          <output className="sr-only">
            {sending
              ? `Uploading ${sending.name}, ${Math.round(sending.progress * 100)} percent. ${active.length} left.`
              : busy
                ? `${active.length} waiting to upload.`
                : `${items.length} ${items.length === 1 ? "file" : "files"} did not upload.`}
          </output>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "rounded-lg border p-3",
                  item.state === "failed"
                    ? "border-danger/30 bg-danger-soft/70"
                    : "border-line bg-surface shadow-xs dark:bg-surface-2",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-fg">
                    {item.name}
                  </span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-xs text-subtle tabular-nums"
                  >
                    {item.state === "sending"
                      ? `${Math.round(item.progress * 100)}%`
                      : item.state === "waiting"
                        ? "Waiting"
                        : "Not uploaded"}
                  </span>
                </div>

                {item.state === "failed" ? (
                  <>
                    <p
                      role="alert"
                      className="mt-1.5 text-[0.8125rem] text-danger"
                    >
                      {item.error}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.retryable ? (
                        <button
                          type="button"
                          disabled={busy || active.length >= limit}
                          onClick={() => void upload(item)}
                          className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[0.8125rem] font-medium text-muted shadow-xs transition-colors duration-150 pointer-fine:h-8 pointer-fine:px-2.5 hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RotateCcwIcon
                            aria-hidden="true"
                            className="size-3.5"
                          />
                          Try again
                          <span className="sr-only"> with {item.name}</span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          setItems((list) =>
                            list.filter((i) => i.id !== item.id),
                          )
                        }
                        className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-muted transition-colors duration-150 pointer-fine:h-8 pointer-fine:px-2.5 hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.06]"
                      >
                        <XIcon aria-hidden="true" className="size-3.5" />
                        Dismiss
                        <span className="sr-only"> {item.name}</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div
                    role="progressbar"
                    aria-label={`Uploading ${item.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(item.progress * 100)}
                    className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3"
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-200"
                      style={{ width: `${Math.round(item.progress * 100)}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
