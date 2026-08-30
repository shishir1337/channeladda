"use client";

import { ImageIcon, Loader2Icon, TrashIcon, UploadIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type UploadKind = "cover" | "avatar" | "proof";

const MAX_MB = 8;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

async function upload(file: File, kind: UploadKind) {
  const body = new FormData();
  body.set("kind", kind);
  body.set("file", file);

  const res = await fetch("/api/uploads", { method: "POST", body });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    sha256?: string;
    error?: string;
  };

  if (!res.ok || !data.url || !data.sha256) {
    throw new Error(data.error ?? "That upload did not go through. Try again.");
  }
  return { url: data.url, sha256: data.sha256 };
}

/** What the caller gets back once a file is stored. */
export type Uploaded = { url: string; sha256: string };

/**
 * One image, with a preview.
 *
 * The file is sent as soon as it is chosen rather than on form submit, so a
 * slow upload does not sit between the person and the button they pressed.
 * `value` is the stored URL and is what the surrounding form should submit.
 */
export function ImageUpload({
  kind,
  value,
  onChange,
  label,
  hint,
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
  className?: string;
  aspect?: "wide" | "square";
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function accept(file: File | undefined) {
    if (!file) return;
    setError(null);

    // Checked again on the server; this is only so the person hears about an
    // obviously wrong file immediately rather than after sending 20MB.
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_MB}MB.`,
      );
      return;
    }

    setBusy(true);
    try {
      const stored = await upload(file, kind);
      onChange(stored.url, stored);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "That upload did not go through.",
      );
    } finally {
      setBusy(false);
      // Let the same file be picked again after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={className}>
      <p className="block text-sm font-medium text-fg">{label}</p>
      {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}

      {value ? (
        <div className="mt-2 flex items-start gap-3">
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
              "rounded-xl border border-line object-cover",
              aspect === "square" ? "size-20" : "h-20 w-36",
            )}
          />
          <button
            type="button"
            onClick={() => {
              onChange(null, null);
              setError(null);
            }}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm text-muted transition-colors hover:border-danger/50 hover:text-danger"
          >
            <TrashIcon aria-hidden="true" className="size-4" />
            Remove
          </button>
        </div>
      ) : (
        <>
          <label
            htmlFor={inputId}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void accept(e.dataTransfer.files[0]);
            }}
            className={cn(
              "mt-2 flex min-h-[6.5rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition-colors",
              dragging
                ? "border-primary bg-primary-soft"
                : "border-line bg-surface-2 hover:border-line-strong",
              error && "border-danger",
            )}
          >
            {busy ? (
              <>
                <Loader2Icon
                  aria-hidden="true"
                  className="size-5 animate-spin text-primary-text"
                />
                <span className="text-sm text-muted">Uploading…</span>
              </>
            ) : (
              <>
                <span className="flex size-9 items-center justify-center rounded-lg bg-surface text-subtle">
                  {aspect === "square" ? (
                    <ImageIcon aria-hidden="true" className="size-4" />
                  ) : (
                    <UploadIcon aria-hidden="true" className="size-4" />
                  )}
                </span>
                <span className="text-sm text-muted">
                  <span className="font-medium text-primary-text">
                    Choose a file
                  </span>{" "}
                  or drag it here
                </span>
                <span className="text-xs text-subtle">
                  PNG, JPEG, WebP or GIF · up to {MAX_MB}MB
                </span>
              </>
            )}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            disabled={busy}
            aria-label={label}
            className="sr-only"
            onChange={(e) => void accept(e.target.files?.[0])}
          />
        </>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
