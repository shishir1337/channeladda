"use client";

import { CircleIcon, SquareIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * The ID check's selfie video, recorded on the page with the camera — the
 * owner, 2026-10-26: "instead of video file upload make it camera option,
 * so they can directly use the camera". Front camera, sound on (they say
 * their name), a running clock, and a stop at `maxSeconds`.
 *
 * What comes back is an ordinary File, so it goes through the same checks
 * and upload as a chosen video. The format is whatever this browser
 * records — MP4 on Safari, WebM elsewhere — and the server checks the
 * bytes either way.
 */

/** The formats tried, best first. Safari records MP4 only. */
const FORMATS = [
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

/** Whether this browser can record from the camera at all. */
export function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function pickFormat(): string | undefined {
  return FORMATS.find((type) => MediaRecorder.isTypeSupported(type));
}

/** Plain words for why the camera did not open. */
function cameraProblem(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Allow the camera and microphone for this site in your browser, then try again. Or upload a video instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "We could not find a camera on this device. Upload a video instead.";
  }
  if (name === "NotReadableError") {
    return "Another app is using the camera. Close it and try again.";
  }
  return "The camera did not start. Try again, or upload a video instead.";
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function CameraRecorder({
  minSeconds,
  maxSeconds,
  onRecorded,
  onCancel,
}: {
  minSeconds: number;
  maxSeconds: number;
  onRecorded: (file: File) => void;
  onCancel: () => void;
}) {
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [state, setState] = useState<"starting" | "ready" | "recording">(
    "starting",
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // The camera opens with the recorder and closes with it, whatever ends it.
  useEffect(() => {
    let live = true;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      })
      .then((stream) => {
        if (!live) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        if (liveRef.current) liveRef.current.srcObject = stream;
        setState("ready");
      })
      .catch((error: unknown) => {
        if (live) setProblem(cameraProblem(error));
      });
    return () => {
      live = false;
      // Cancelled or gone mid-recording: the half-made clip is dropped,
      // not handed back as if it had been finished.
      const recorder = recorderRef.current;
      if (recorder && recorder.state === "recording") {
        recorder.onstop = null;
        recorder.stop();
      }
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      streamRef.current = null;
    };
  }, []);

  // The clock, and the stop at the limit.
  useEffect(() => {
    if (state !== "recording") return;
    const started = Date.now();
    const tick = setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      setElapsed(seconds);
      if (seconds >= maxSeconds) recorderRef.current?.stop();
    }, 250);
    return () => clearInterval(tick);
  }, [state, maxSeconds]);

  function start() {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickFormat();
    let recorder: MediaRecorder;
    try {
      // About 1.5 Mbit/s: a clear face and card at a size that uploads
      // over mobile data — 30 seconds is roughly 6MB.
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 1_500_000,
      });
    } catch {
      setProblem(
        "This browser cannot record video. Upload a video you took instead.",
      );
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes("mp4") ? "mp4" : "webm";
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      streamRef.current = null;
      onRecorded(
        new File([blob], `selfie-video.${ext}`, { type: type.split(";")[0] }),
      );
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setElapsed(0);
    setState("recording");
  }

  const canStop = elapsed >= minSeconds;

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-line bg-black">
      <div className="relative aspect-[3/4] w-full sm:aspect-video">
        {/* Mirrored, as a selfie camera looks; the recording is not. */}
        <video
          ref={liveRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 size-full -scale-x-100 object-cover"
        />
        {state === "starting" && !problem ? (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/80">
            Opening the camera… Allow it when your browser asks.
          </p>
        ) : null}
        {problem ? (
          <p
            role="alert"
            className="absolute inset-0 flex items-center justify-center bg-black/80 px-6 text-center text-sm leading-relaxed text-white"
          >
            {problem}
          </p>
        ) : null}
        {state === "recording" ? (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white tabular-nums">
            <span
              aria-hidden="true"
              className="size-2 animate-pulse rounded-full bg-danger"
            />
            {clock(elapsed)} / {clock(maxSeconds)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-surface px-3 py-3">
        {state === "recording" ? (
          <Button
            type="button"
            size="md"
            variant="danger"
            disabled={!canStop}
            onClick={() => recorderRef.current?.stop()}
          >
            <SquareIcon aria-hidden="true" className="fill-current" />
            {canStop
              ? "Stop and use it"
              : `Keep going… ${minSeconds - elapsed}`}
          </Button>
        ) : (
          <Button
            type="button"
            size="md"
            disabled={state !== "ready"}
            onClick={start}
          >
            <CircleIcon
              aria-hidden="true"
              className="fill-danger text-danger"
            />
            Start recording
          </Button>
        )}
        <Button type="button" size="md" variant="ghost" onClick={onCancel}>
          <XIcon aria-hidden="true" />
          Cancel
        </Button>
        <p aria-live="polite" className="sr-only">
          {state === "recording" ? "Recording" : ""}
        </p>
      </div>
    </div>
  );
}
