"use client";

import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/section";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with the real reporter once one is wired up.
    console.error(error);
  }, [error]);

  return (
    <Section>
      <Container className="max-w-3xl text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <TriangleAlertIcon aria-hidden="true" className="size-7" />
        </span>

        <h1 className="mt-8 text-[1.75rem] leading-[1.12] font-bold sm:text-4xl">
          Something broke on our side
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-[0.9375rem] leading-relaxed text-muted sm:text-base">
          No order or payment was affected by this. Try again, and if it keeps
          happening our support team can pick it up from here.
        </p>

        {error.digest ? (
          <p className="tnum mt-5 text-xs text-subtle">
            Reference: <span className="text-muted">{error.digest}</span>
          </p>
        ) : null}

        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button size="lg" onClick={reset} className="w-full sm:w-auto">
            <RefreshCwIcon aria-hidden="true" className="size-4" />
            Try again
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
          >
            <Link href="/support">Contact support</Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}
