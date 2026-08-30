"use client";

import { CheckCircle2Icon, SendIcon } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SUPPORT_TOPICS } from "@/lib/support";
import { sendSupportMessage } from "@/server/actions/support";

/**
 * The contact form.
 *
 * It used to validate the fields, say "Message sent" and send nothing — so
 * somebody watching a scam unfold was thanked and ignored. It writes a real
 * ticket now, a moderator sees it in their queue, and the sender gets a
 * reference they can quote back.
 */
export function SupportForm() {
  const [reference, setReference] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const emailId = useId();
  const topicId = useId();
  const orderId = useId();
  const messageId = useId();

  if (reference) {
    return (
      <div className="flex flex-col items-start rounded-panel border border-verified/30 bg-verified-soft p-6 sm:p-8">
        <span className="flex size-12 items-center justify-center rounded-xl bg-surface text-verified">
          <CheckCircle2Icon aria-hidden="true" className="size-6" />
        </span>
        <h2 className="mt-5 font-display text-xl font-bold">Message sent</h2>
        <p className="mt-2.5 max-w-md text-sm leading-relaxed text-muted">
          Your reference is{" "}
          <span className="font-semibold text-fg">{reference}</span>. We reply
          to everything within 12 hours, and much faster if it is about a live
          order.
        </p>
        <Button
          variant="secondary"
          size="md"
          className="mt-6"
          onClick={() => setReference(null)}
        >
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const next: Record<string, string> = {};

        const email = String(data.get("email") ?? "").trim();
        if (!email) next.email = "Enter the email address we should reply to.";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          next.email = "That does not look like a valid email address.";

        const message = String(data.get("message") ?? "").trim();
        if (message.length < 20)
          next.message =
            "Tell us a little more — at least a couple of sentences helps us answer properly.";

        setErrors(next);
        setFailed(null);
        if (Object.keys(next).length > 0) return;

        // The same rules run again on the server. This pass is only so the
        // person sees the problem without a round trip.
        startTransition(async () => {
          const result = await sendSupportMessage({
            email,
            topic: String(data.get("topic") ?? SUPPORT_TOPICS[0]),
            orderRef: String(data.get("order") ?? ""),
            message,
          });
          if (!result.ok) {
            setFailed(result.error);
            return;
          }
          setReference(result.reference);
        });
      }}
      className="rounded-panel border border-line bg-surface p-6 sm:p-8"
    >
      <h2 className="font-display text-xl font-bold">Send us a message</h2>
      <p className="mt-2 text-sm text-muted">
        The more detail you give, the fewer round trips it takes.
      </p>

      <div className="mt-6 flex flex-col gap-5">
        <Field
          id={emailId}
          name="email"
          label="Your email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email}
          required
        />

        <div>
          <label
            htmlFor={topicId}
            className="block text-sm font-medium text-fg"
          >
            What is it about?
          </label>
          <select
            id={topicId}
            name="topic"
            defaultValue={SUPPORT_TOPICS[0]}
            className="mt-2 h-12 w-full cursor-pointer appearance-none rounded-xl border border-line bg-surface-2 px-3.5 text-[0.9375rem] text-fg focus:border-primary/60 focus:outline-none"
          >
            {SUPPORT_TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </div>

        <Field
          id={orderId}
          name="order"
          label="Order reference"
          hint="Optional — but it gets you an answer much faster."
          placeholder="e.g. CA-40218"
        />

        <div>
          <label
            htmlFor={messageId}
            className="block text-sm font-medium text-fg"
          >
            Message <span className="text-danger">*</span>
          </label>
          <textarea
            id={messageId}
            name="message"
            rows={6}
            required
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? `${messageId}-error` : undefined}
            placeholder="What happened, and what were you expecting instead?"
            className={`mt-2 w-full rounded-xl border bg-surface-2 px-3.5 py-3 text-[0.9375rem] text-fg placeholder:text-subtle focus:outline-none ${
              errors.message
                ? "border-danger focus:border-danger"
                : "border-line focus:border-primary/60"
            }`}
          />
          {errors.message ? (
            <p
              id={`${messageId}-error`}
              role="alert"
              className="mt-2 text-sm text-danger"
            >
              {errors.message}
            </p>
          ) : null}
        </div>
      </div>

      {failed ? (
        <p role="alert" className="mt-5 text-sm text-danger">
          {failed}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="mt-7 w-full sm:w-auto"
      >
        <SendIcon aria-hidden="true" className="size-4" />
        {pending ? "Sending…" : "Send message"}
      </Button>
      <p className="mt-3 text-xs text-subtle">
        We never ask for passwords, two-factor codes or recovery emails.
      </p>
    </form>
  );
}

function Field({
  id,
  name,
  label,
  hint,
  error,
  required,
  ...props
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label} {required ? <span className="text-danger">*</span> : null}
      </label>
      {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
      <input
        id={id}
        name={name}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-2 h-12 w-full rounded-xl border bg-surface-2 px-3.5 text-base text-fg placeholder:text-subtle focus:outline-none sm:text-[0.9375rem] ${
          error
            ? "border-danger focus:border-danger"
            : "border-line focus:border-primary/60"
        }`}
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
