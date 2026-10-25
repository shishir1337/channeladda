"use client";

import {
  CameraIcon,
  CheckIcon,
  ChevronDownIcon,
  LockIcon,
  RotateCcwIcon,
  UploadIcon,
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
import { hintClass, inputClass, labelClass } from "@/components/app/kit";
import { FormNotice, TextField } from "@/components/auth/fields";
import {
  CameraRecorder,
  canRecord,
} from "@/components/dashboard/camera-recorder";
import { BusyLabel } from "@/components/messages/chat-parts";
import { Button } from "@/components/ui/button";
import { sendUpload } from "@/components/upload/image-upload";
import {
  documentOption,
  KYC_DOCUMENTS,
  KYC_IMAGE_MAX_MB,
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

/** What the on-page camera records: the 10 to 30 seconds the steps ask for. */
const RECORD_MIN_SECONDS = 5;
const RECORD_MAX_SECONDS = 30;

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
  // The video is recorded on the page by default (the owner, 2026-10-26);
  // a browser that cannot record offers the upload alone.
  const [recording, setRecording] = useState(false);
  const [camera, setCamera] = useState(false);
  useEffect(() => setCamera(media === "video" && canRecord()), [media]);

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

  if (recording) {
    return (
      <div>
        <p className={labelClass}>
          {label}
          <span className="ml-0.5 text-danger">*</span>
        </p>
        <CameraRecorder
          minSeconds={RECORD_MIN_SECONDS}
          maxSeconds={RECORD_MAX_SECONDS}
          onRecorded={(file) => {
            setRecording(false);
            void choose(file);
          }}
          onCancel={() => setRecording(false)}
        />
      </div>
    );
  }

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
              className="max-h-32 w-auto max-w-full self-start rounded-lg border border-line bg-surface-2 object-contain"
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
            {camera ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setRecording(true)}
              >
                <RotateCcwIcon aria-hidden="true" />
                Record again
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={camera ? "ghost" : "secondary"}
              onClick={() => inputRef.current?.click()}
            >
              {camera ? (
                <UploadIcon aria-hidden="true" />
              ) : (
                <RotateCcwIcon aria-hidden="true" />
              )}
              {media === "image"
                ? "Change"
                : camera
                  ? "Upload one instead"
                  : "Use another video"}
            </Button>
            {optional ? (
              <Button type="button" size="sm" variant="ghost" onClick={clear}>
                <XIcon aria-hidden="true" />
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      ) : camera && !sending ? (
        <div
          className={cn(
            "mt-2 flex flex-col items-center gap-2.5 rounded-lg border border-dashed border-line-strong bg-surface px-4 py-4 text-center dark:bg-surface-2/40",
            shown && "border-danger",
          )}
        >
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              type="button"
              size="md"
              className="w-full sm:w-auto"
              onClick={() => {
                setProblem(null);
                setRecording(true);
              }}
            >
              <CameraIcon aria-hidden="true" />
              Record with camera
            </Button>
            <Button
              type="button"
              size="md"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon aria-hidden="true" />
              Upload a video
            </Button>
          </div>
          <span className="text-xs text-subtle">
            Up to {RECORD_MAX_SECONDS} seconds
          </span>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={cn(
            "group mt-2 flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-4 text-center transition-colors duration-150",
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
              <Icon aria-hidden="true" className="size-5 text-muted" />
              <span className="text-sm font-medium text-fg">
                {media === "image" ? "Add a photo" : "Record or choose a video"}
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
        <div>
          <label htmlFor={groupId} className={labelClass}>
            Which ID are you sending?
            <span className="ml-0.5 text-danger">*</span>
          </label>
          <div className="relative mt-1.5">
            <select
              id={groupId}
              name="documentType"
              value={documentType}
              aria-invalid={errors.documentType ? true : undefined}
              aria-describedby={
                errors.documentType ? `${groupId}-error` : undefined
              }
              onChange={(event) => {
                const option = documentOption(event.target.value);
                setDocumentType((option?.id ?? "") as KycDocumentId | "");
                setErrors(({ documentType: _, ...rest }) => rest);
                // A PAN card or a passport has no back to send.
                if (!option?.back) setBack(null);
              }}
              className={cn(
                inputClass,
                "cursor-pointer appearance-none pr-10",
                !documentType && "text-subtle",
              )}
            >
              <option value="" disabled>
                Choose your ID
              </option>
              {KYC_DOCUMENTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
            />
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id={nameId}
            name="fullName"
            label="Full name, as on the ID"
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
            label="Country of the ID"
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
          Flat surface, good light, all four corners, no glare.
        </p>
        <div className="grid grid-cols-2 gap-3">
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
              label="Back"
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
        </div>
      </Step>

      <Step n={3} title="Selfie video">
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          Hold the same ID by your face, then say your full name and{" "}
          <span className="font-medium text-fg">“Channel Adda”</span>.
        </p>
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
        <p className="flex items-center gap-1.5 text-xs text-subtle">
          {uploading > 0 ? (
            "Wait for your files to finish uploading."
          ) : (
            <>
              <LockIcon aria-hidden="true" className="size-3 shrink-0" />
              Only our verification team sees these.
            </>
          )}
        </p>
      </div>
    </form>
  );
}
