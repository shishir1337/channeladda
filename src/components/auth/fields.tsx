"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import {
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export function TextField({
  id,
  label,
  hint,
  error,
  className,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
        {props.required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-subtle">
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={
          // Both, in reading order. The hint was rendered and then never
          // referenced, so a screen-reader user got the label and the error
          // and never the sentence explaining what to type.
          [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        className={cn(
          // 16px base avoids iOS zooming the field on focus.
          "mt-2 h-12 w-full rounded-xl border bg-surface-2 px-3.5 text-base text-fg placeholder:text-subtle focus:outline-none sm:text-[0.9375rem]",
          error
            ? "border-danger focus:border-danger"
            : "border-line focus:border-primary/60",
        )}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordField({
  id,
  label,
  hint,
  error,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
        {props.required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-subtle">
          {hint}
        </p>
      ) : null}
      <div className="relative mt-2">
        <input
          id={id}
          type={shown ? "text" : "password"}
          aria-invalid={Boolean(error)}
          aria-describedby={
            // Both, in reading order. The hint was rendered and then never
            // referenced, so a screen-reader user got the label and the error
            // and never the sentence explaining what to type.
            [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          className={cn(
            "h-12 w-full rounded-xl border bg-surface-2 pr-12 pl-3.5 text-base text-fg placeholder:text-subtle focus:outline-none sm:text-[0.9375rem]",
            error
              ? "border-danger focus:border-danger"
              : "border-line focus:border-primary/60",
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? "Hide password" : "Show password"}
          className="absolute top-1/2 right-1 inline-flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors hover:text-fg"
        >
          {shown ? (
            <EyeOffIcon aria-hidden="true" className="size-[1.15rem]" />
          ) : (
            <EyeIcon aria-hidden="true" className="size-[1.15rem]" />
          )}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Shown above a form when submission fails as a whole. */
/**
 * The same field, for prose.
 *
 * Matches `TextField` deliberately — label, hint, error, the 16px base that
 * stops iOS zooming on focus — so a form can mix the two without the taller
 * one looking like it came from somewhere else.
 */
export function TextArea({
  id,
  label,
  hint,
  error,
  className,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
        {props.required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-subtle">
          {hint}
        </p>
      ) : null}
      <textarea
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={
          // Both, in reading order. The hint was rendered and then never
          // referenced, so a screen-reader user got the label and the error
          // and never the sentence explaining what to type.
          [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        className={cn(
          "mt-2 w-full resize-y rounded-xl border bg-surface-2 p-3.5 text-base leading-relaxed text-fg placeholder:text-subtle focus:outline-none sm:text-[0.9375rem]",
          error
            ? "border-danger focus:border-danger"
            : "border-line focus:border-primary/60",
        )}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormNotice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mb-5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg"
    >
      {children}
    </p>
  );
}
