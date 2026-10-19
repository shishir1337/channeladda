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
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-line bg-surface text-muted">
          <CompassIcon aria-hidden="true" className="size-7" />
        </span>

        <p className="tnum mt-8 text-sm font-medium text-subtle">Error 404</p>
        <h1 className="mt-3 text-[1.875rem] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-[2.5rem]">
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
          <p className="text-[0.8125rem] font-medium text-subtle">
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
