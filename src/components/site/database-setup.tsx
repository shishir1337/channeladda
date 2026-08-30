import { DatabaseIcon, TerminalIcon } from "lucide-react";
import { Container, Section } from "@/components/ui/section";

const steps = [
  {
    command: "pnpm db:up",
    note: "Starts Postgres in Docker. Needs Docker Desktop to be running.",
  },
  {
    command: "pnpm db:reset",
    note: "Applies migrations and seeds the marketplace. First run, or after a schema change.",
  },
  {
    command: "pnpm dev",
    note: "Restart the dev server if it was already running.",
  },
];

/**
 * Shown in development when Postgres is unreachable. Visitors never see this —
 * the layout only renders it outside production.
 */
export function DatabaseSetup() {
  return (
    <Section>
      <Container className="max-w-2xl">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-primary-soft text-primary-text">
          <DatabaseIcon aria-hidden="true" className="size-7" />
        </span>

        <h1 className="mt-8 text-[1.75rem] leading-[1.12] font-bold sm:text-4xl">
          The database is not running
        </h1>
        <p className="mt-5 text-[0.9375rem] leading-relaxed text-muted sm:text-base">
          Channel Adda reads its listings, sellers and orders from Postgres.
          Nothing is broken in the code — the database just is not up, so every
          page has nothing to render.
        </p>

        <ol className="mt-8 flex flex-col gap-4">
          {steps.map((step, i) => (
            <li key={step.command} className="flex gap-4">
              <span className="tnum mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-xs font-semibold text-muted">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
                  <TerminalIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-subtle"
                  />
                  <code className="font-mono text-sm whitespace-nowrap text-fg">
                    {step.command}
                  </code>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {step.note}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 rounded-card border border-line bg-surface p-5">
          <h2 className="font-display text-base font-semibold">
            Not using Docker?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Point <code className="font-mono text-fg">DATABASE_URL</code> in{" "}
            <code className="font-mono text-fg">.env</code> at any Postgres you
            already have, then run{" "}
            <code className="font-mono text-fg">pnpm db:reset</code>.
          </p>
        </div>

        <p className="mt-8 text-xs text-subtle">
          This screen only appears in development. In production a failure here
          surfaces as the normal error page.
        </p>
      </Container>
    </Section>
  );
}
