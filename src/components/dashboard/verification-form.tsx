"use client";

import {
  CameraIcon,
  CheckIcon,
  LockIcon,
  RotateCcwIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { hintClass, labelClass } from "@/components/app/kit";
import { FormNotice, TextField } from "@/components/auth/fields";
import { BusyLabel } from "@/components/messages/chat-parts";
import { Button } from "@/components/ui/button";
import { sendUpload } from "@/components/upload/image-upload";
import {
  documentOption,
  KYC_DOCUMENTS,
  KYC_IMAGE_MAX_MB,
  KYC_REVIEW_HOURS,
  KYC_VIDEO_MAX_MB,
  KYC_VIDEO_MAX_SECONDS,
  type KycDocumentId,
  type KycErrors,
} from "@/lib/kyc";
import { cn } from "@/lib/utils";
import { submitVerification } from "@/server/actions/kyc";

/**
 * The ID check, for the Verified badge.
 *
 * Phone first: most members will take these photos and the video on the
 * phone they are reading this on, so every file field opens the camera or
 * the gallery, and each file goes up the moment it is chosen with its own
 * progress — a 40MB video over mobile data is a long wait to sit through
 * after pressing Send.
 *
 * Previews are drawn from the file in the browser, not fetched back: the
 * stored copy is private, and there is no reason to download what is
 * already on the phone.
 */

type Media = "image" | "video";

/** A file that has gone up. `preview` is a local object URL. */
type Picked = { url: string; preview: string; name: string };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_ACCEPT = IMAGE_TYPES.join(",");
// Any video: the phone's own camera decides the format, and the server
// checks the bytes either way (MP4, MOV or WebM).
const VIDEO_ACCEPT = "video/*";

/** How long a clip is, or null when the browser cannot tell. Never throws. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const done = (seconds: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    // A format this browser cannot open never fires either event.
    setTimeout(() => done(null), 5000);
    video.src = url;
  });
}

/** Why a file is refused before it is sent, or null. Checked again on the server. */
async function refusal(file: File, media: Media): Promise<string | null> {
  if (media === "image") {
    if (file.type && !IMAGE_TYPES.includes(file.type)) {
      return "That is not a photo we can take. Use a JPEG, PNG or WebP photo.";
    }
    if (file.size > KYC_IMAGE_MAX_MB * 1024 * 1024) {
      return `That photo is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${KYC_IMAGE_MAX_MB}MB.`;
    }
    return null;
  }

  if (file.type && !file.type.startsWith("video/")) {
    return "That is not a video. Record one with your camera.";
  }
  if (file.size > KYC_VIDEO_MAX_MB * 1024 * 1024) {
    return `That video is ${(file.size / 1024 / 1024).toFixed(0)}MB. The limit is ${KYC_VIDEO_MAX_MB}MB. Record a shorter one, 10 to 30 seconds.`;
  }
  const seconds = await readDuration(file);
  if (seconds !== null && seconds > KYC_VIDEO_MAX_SECONDS) {
    return `That video is ${Math.round(seconds)} seconds long. Keep it to 10 to 30 seconds.`;
  }
  if (seconds !== null && seconds < 3) {
    return "That video is too short. Record 10 to 30 seconds.";
  }
  return null;
}

/** Sends one file under `kyc`; never throws. */
async function upload(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const stored = await sendUpload(file, "kyc", onProgress);
    return { ok: true, url: stored.url };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "That upload did not go through. Try again.",
    };
  }
}

/**
 * One photo or the video: pick, send, preview, change.
 */
function FileField({
  label,
  hint,
  media,
  value,
  onChange,
  error,
  optional,
  onBusy,
}: {
  label: string;
  hint?: ReactNode;
  media: Media;
  value: Picked | null;
  onChange: (value: Picked | null) => void;
  error?: string;
  optional?: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);

  // The object URL lives as long as the field does.
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  async function choose(file: File) {
    setProblem(null);
    const refused = await refusal(file, media);
    if (refused) {
      setProblem(refused);
      return;
    }

    setSending(true);
    setProgress(0);
    onBusy(true);
    const sent = await upload(file, setProgress);
    setSending(false);
    onBusy(false);
    if (!sent.ok) {
      setProblem(sent.error);
      return;
    }

    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const preview = URL.createObjectURL(file);
    previewRef.current = preview;
    onChange({ url: sent.url, preview, name: file.name });
  }

  function clear() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setProblem(null);
    onChange(null);
  }

  const shown = problem ?? error;
  const Icon = media === "image" ? CameraIcon : VideoIcon;

  return (
    <div>
      <p className={labelClass}>
        {label}
        {optional ? (
          <span className="font-normal text-subtle"> (optional)</span>
        ) : (
          <span className="ml-0.5 text-danger">*</span>
        )}
      </p>
      {hint ? (
        <div id={hintId} className={hintClass}>
          {hint}
        </div>
      ) : null}

      {value && !sending ? (
        <div className="mt-2 flex flex-col gap-2.5">
          {media === "image" ? (
            // biome-ignore lint/performance/noImgElement: a local preview of the photo just picked; the stored copy is private and never goes through the optimiser.
            <img
              src={value.preview}
              alt={`Your ${label.toLowerCase()}`}
              className="max-h-52 w-auto max-w-full self-start rounded-lg border border-line bg-surface-2 object-contain"
            />
          ) : (
            // biome-ignore lint/a11y/useMediaCaption: the member's own selfie video, previewed before it is checked.
            <video
              src={value.preview}
              controls
              playsInline
              preload="metadata"
              className="max-h-64 w-full rounded-lg border border-line bg-black"
            />
          )}
          <p className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-verified">
            <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">Added</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
            >
              <RotateCcwIcon aria-hidden="true" />
              {media === "image" ? "Use another photo" : "Use another video"}
            </Button>
            {optional ? (
              <Button type="button" size="sm" variant="ghost" onClick={clear}>
                <XIcon aria-hidden="true" />
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={cn(
            "group mt-2 flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition-colors duration-150",
            sending
              ? "cursor-progress border-line-strong bg-surface-2/50"
              : "cursor-pointer border-line-strong bg-surface hover:border-fg/25 hover:bg-surface-2/50 dark:bg-surface-2/40",
            shown && "border-danger",
          )}
        >
          {sending ? (
            <>
              <span className="text-[0.8125rem] text-muted">
                Uploading… {Math.round(progress * 100)}%
              </span>
              <span
                role="progressbar"
                aria-label={`Uploading ${label.toLowerCase()}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                className="h-1 w-full max-w-56 overflow-hidden rounded-full bg-surface-3"
              >
                <span
                  className="block h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </span>
            </>
          ) : (
            <>
              <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-surface text-muted shadow-xs dark:bg-surface-2">
                <Icon aria-hidden="true" className="size-4.5" />
              </span>
              <span className="text-sm font-medium text-fg">
                {media === "image"
                  ? "Take a photo or choose one"
                  : "Record a video or choose one"}
              </span>
              <span className="text-xs text-subtle">
                {media === "image"
                  ? `JPEG, PNG or WebP · up to ${KYC_IMAGE_MAX_MB}MB`
                  : `MP4, MOV or WebM · up to ${KYC_VIDEO_MAX_MB}MB`}
              </span>
            </>
          )}
        </label>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={media === "image" ? IMAGE_ACCEPT : VIDEO_ACCEPT}
        disabled={sending}
        aria-label={label}
        aria-describedby={
          [hint ? hintId : null, shown ? errorId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        aria-invalid={shown ? true : undefined}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Let the same file be picked again after a failure.
          event.target.value = "";
          if (file) void choose(file);
        }}
      />

      {shown ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 text-[0.8125rem] text-danger"
        >
          {shown}
        </p>
      ) : null}
    </div>
  );
}

/** A numbered part of the form, so a long form reads as three short steps. */
function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h3 className="flex items-center gap-2.5 text-sm font-semibold text-fg">
        <span
          aria-hidden="true"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-xs font-semibold text-muted tabular-nums"
        >
          {n}
        </span>
        {title}
      </h3>
      <div className="mt-3.5 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function VerificationForm({
  defaultName,
  defaultCountry,
}: {
  defaultName: string;
  defaultCountry: string;
}) {
  const router = useRouter();
  const groupId = useId();
  const nameId = useId();
  const countryId = useId();

  const [documentType, setDocumentType] = useState<KycDocumentId | "">("");
  const [fullName, setFullName] = useState(defaultName);
  const [country, setCountry] = useState(defaultCountry);
  const [front, setFront] = useState<Picked | null>(null);
  const [back, setBack] = useState<Picked | null>(null);
  const [video, setVideo] = useState<Picked | null>(null);
  const [uploading, setUploading] = useState(0);
  const [errors, setErrors] = useState<KycErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const doc = documentOption(documentType);
  const busy = (on: boolean) =>
    setUploading((n) => Math.max(0, n + (on ? 1 : -1)));

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setFailure(null);
        startTransition(async () => {
          const result = await submitVerification({
            documentType,
            fullName,
            country,
            frontUrl: front?.url ?? "",
            backUrl: doc?.back ? (back?.url ?? "") : "",
            videoUrl: video?.url ?? "",
          });
          if (result.ok) {
            setErrors({});
            router.refresh();
            return;
          }
          setErrors(result.errors ?? {});
          setFailure(
            result.error ??
              "Some details need fixing. Look for the red notes above.",
          );
        });
      }}
      className="flex flex-col gap-5"
    >
      <Step n={1} title="Your ID">
        <fieldset
          aria-describedby={
            errors.documentType ? `${groupId}-error` : undefined
          }
        >
          <legend className={labelClass}>
            Which ID are you sending?
            <span className="ml-0.5 text-danger">*</span>
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            {KYC_DOCUMENTS.map((option) => {
              const selected = option.id === documentType;
              return (
                <label
                  key={option.id}
                  className={cn(
                    "relative flex min-h-14 cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-[border-color,background-color] duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40",
                    selected
                      ? "border-primary bg-primary-soft"
                      : "border-line bg-surface hover:border-line-strong dark:bg-surface-2",
                  )}
                >
                  <input
                    type="radio"
                    name={groupId}
                    value={option.id}
                    checked={selected}
                    onChange={() => {
                      setDocumentType(option.id);
                      setErrors(({ documentType: _, ...rest }) => rest);
                      // A PAN card or a passport has no back to send.
                      if (!option.back) setBack(null);
                    }}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 inline-flex size-4.5 shrink-0 items-center justify-center rounded-full border",
                      selected
                        ? "border-primary bg-primary text-primary-fg"
                        : "border-line-strong",
                    )}
                  >
                    {selected ? <CheckIcon className="size-3" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm leading-5 font-medium text-fg">
                      {option.label}
                    </span>
                    {option.hint ? (
                      <span className="mt-0.5 block text-xs leading-snug text-muted">
                        {option.hint}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
          {errors.documentType ? (
            <p
              id={`${groupId}-error`}
              role="alert"
              className="mt-1.5 text-[0.8125rem] text-danger"
            >
              {errors.documentType}
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id={nameId}
            name="fullName"
            label="Your full name, as on the ID"
            hint="Exactly as it is printed."
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            error={errors.fullName}
            autoComplete="name"
            maxLength={80}
            required
          />
          <TextField
            id={countryId}
            name="country"
            label="Country"
            hint="The country that gave you the ID."
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            error={errors.country}
            placeholder="India"
            autoComplete="country-name"
            maxLength={56}
            required
          />
        </div>
      </Step>

      <Step n={2} title="Photos of your ID">
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          Put the ID on a flat, dark surface in good light. All four corners in
          the photo, no glare, nothing covered.
        </p>
        <FileField
          label={doc?.front ?? "Front of the ID"}
          media="image"
          value={front}
          onChange={(value) => {
            setFront(value);
            if (value) setErrors(({ frontUrl: _, ...rest }) => rest);
          }}
          error={errors.frontUrl}
          onBusy={busy}
        />
        {doc?.back ? (
          <FileField
            label="Back of the ID"
            hint="Add it if your ID has details on the back."
            media="image"
            value={back}
            onChange={(value) => {
              setBack(value);
              setErrors(({ backUrl: _, ...rest }) => rest);
            }}
            error={errors.backUrl}
            optional
            onBusy={busy}
          />
        ) : null}
      </Step>

      <Step n={3} title="Selfie video">
        <div className="text-[0.8125rem] leading-relaxed text-muted">
          <p>Record a short video of yourself, 10 to 30 seconds:</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 marker:text-subtle">
            <li>
              Hold the same ID next to your face, photo side to the camera.
            </li>
            <li>
              Say your full name, then say{" "}
              <span className="font-medium text-fg">“Channel Adda”</span>.
            </li>
            <li>Keep your face and the ID clear, in good light.</li>
          </ol>
        </div>
        <FileField
          label="Your video"
          media="video"
          value={video}
          onChange={(value) => {
            setVideo(value);
            if (value) setErrors(({ videoUrl: _, ...rest }) => rest);
          }}
          error={errors.videoUrl}
          onBusy={busy}
        />
      </Step>

      <p className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 text-[0.8125rem] leading-relaxed text-fg">
        <LockIcon
          aria-hidden="true"
          className="mt-0.5 size-3.5 shrink-0 text-muted"
        />
        <span>
          Only our verification team sees these. They are never shown on your
          profile.
        </span>
      </p>

      {failure ? <FormNotice>{failure}</FormNotice> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-auto"
          disabled={pending || uploading > 0}
        >
          <BusyLabel
            busy={pending}
            idle="Send for checking"
            working="Sending…"
          />
        </Button>
        <p className="text-xs text-subtle">
          {uploading > 0
            ? "Wait for your files to finish uploading."
            : `A person checks it, usually within ${KYC_REVIEW_HOURS} hours.`}
        </p>
      </div>
    </form>
  );
}
