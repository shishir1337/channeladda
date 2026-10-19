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
      <label
        htmlFor={id}
        className="block text-sm font-medium text-fg app:text-[0.8125rem]"
      >
        {label}
        {props.required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      {hint ? (
        <p
          id={`${id}-hint`}
          className="mt-1 text-xs text-subtle app:leading-relaxed"
        >
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
          "mt-2 h-11 w-full rounded-[10px] border bg-surface px-3.5 text-base text-fg shadow-xs transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-line-strong focus:ring-[3px] focus:outline-none sm:text-[0.9375rem] dark:bg-surface-2 app:mt-1.5 app:px-3 app:pointer-fine:h-9 app:rounded-lg app:sm:text-sm",
          error
            ? "border-danger focus:border-danger focus:ring-danger/15"
            : "border-line focus:border-primary focus:ring-primary/20",
        )}
        {...props}
      />
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-2 text-sm text-danger app:mt-1.5 app:text-[0.8125rem]"
        >
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
  aside,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /** Beside the label, on the right — "Forgot password?". */
  aside?: React.ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);

  return (
    <div className={aside ? "relative" : undefined}>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-fg app:text-[0.8125rem]"
      >
        {label}
        {props.required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      {hint ? (
        <p
          id={`${id}-hint`}
          className="mt-1 text-xs text-subtle app:leading-relaxed"
        >
          {hint}
        </p>
      ) : null}
      <div className="relative mt-2 app:mt-1.5">
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
            "h-11 w-full rounded-[10px] border bg-surface pr-12 pl-3.5 text-base text-fg shadow-xs transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-line-strong focus:ring-[3px] focus:outline-none sm:text-[0.9375rem] dark:bg-surface-2 app:pl-3 app:pointer-fine:h-9 app:rounded-lg app:sm:text-sm",
            error
              ? "border-danger focus:border-danger focus:ring-danger/15"
              : "border-line focus:border-primary focus:ring-primary/20",
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? "Hide password" : "Show password"}
          className="absolute top-1/2 right-1 inline-flex size-10 -translate-y-1/2 app:pointer-fine:size-7 app:rounded-md cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors hover:text-fg"
        >
          {shown ? (
            <EyeOffIcon aria-hidden="true" className="size-[1.15rem]" />
          ) : (
            <EyeIcon aria-hidden="true" className="size-[1.15rem]" />
          )}
        </button>
      </div>
      {/* After the input in the page, so Tab goes from the email straight
          to the password; drawn up beside the label. */}
      {aside ? <div className="absolute top-0 right-0">{aside}</div> : null}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-2 text-sm text-danger app:mt-1.5 app:text-[0.8125rem]"
        >
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
      <label
        htmlFor={id}
        className="block text-sm font-medium text-fg app:text-[0.8125rem]"
      >
        {label}
        {props.required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      {hint ? (
        <p
          id={`${id}-hint`}
          className="mt-1 text-xs text-subtle app:leading-relaxed"
        >
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
          "mt-2 w-full resize-y rounded-[10px] border bg-surface px-3.5 py-2.5 text-base leading-relaxed text-fg shadow-xs transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-line-strong focus:ring-[3px] focus:outline-none sm:text-[0.9375rem] dark:bg-surface-2 app:mt-1.5 app:px-3 app:py-2 app:rounded-lg app:sm:text-sm",
          error
            ? "border-danger focus:border-danger focus:ring-danger/15"
            : "border-line focus:border-primary focus:ring-primary/20",
        )}
        {...props}
      />
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-2 text-sm text-danger app:mt-1.5 app:text-[0.8125rem]"
        >
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
      className="mb-5 rounded-[10px] border border-danger/25 bg-danger-soft/80 px-4 py-3 text-sm text-fg app:mb-3 app:rounded-lg app:py-2.5 app:text-[0.8125rem]"
    >
      {children}
    </p>
  );
}
