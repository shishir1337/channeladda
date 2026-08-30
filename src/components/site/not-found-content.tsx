import { ArrowRightIcon, CompassIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/section";
import { platforms } from "@/data/platforms";

/** Shared by the root 404 and any in-app `notFound()` call. */
export function NotFoundContent() {
  return (
    <Section>
      <Container className="max-w-3xl text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary-soft text-primary-text">
          <CompassIcon aria-hidden="true" className="size-7" />
        </span>

        <p className="tnum mt-8 font-display text-sm font-semibold tracking-[0.18em] text-subtle uppercase">
          Error 404
        </p>
        <h1 className="mt-3 text-[2rem] leading-[1.1] font-bold sm:text-5xl">
          This page has been sold, moved or never existed
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-[0.9375rem] leading-relaxed text-muted sm:text-base">
          If you followed a link to a listing, it may have been withdrawn by the
          seller or already sold. The marketplace is still right here.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/browse">
              <SearchIcon aria-hidden="true" className="size-4" />
              Browse all accounts
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
          >
            <Link href="/">Back to home</Link>
          </Button>
        </div>

        <div className="mt-12 border-t border-line pt-8">
          <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
            Or jump to a platform
          </p>
          <ul className="mt-4 flex flex-wrap justify-center gap-2">
            {platforms.map((platform) => (
              <li key={platform.id}>
                <Link
                  href={`/browse/${platform.id}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  <platform.icon
                    className="size-4"
                    style={{ color: platform.tint }}
                  />
                  {platform.name}
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="size-3.5 opacity-50"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  );
}
