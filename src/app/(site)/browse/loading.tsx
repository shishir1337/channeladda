import { Container } from "@/components/ui/section";

/** Skeleton that mirrors the browse grid so the page does not jump on load. */
export default function BrowseLoading() {
  return (
    <Container className="py-8 sm:py-10 lg:py-12">
      <div className="lg:grid lg:grid-cols-[17rem_1fr] lg:gap-10">
        <div className="hidden lg:block">
          <div className="h-[32rem] animate-pulse rounded-card border border-line bg-surface-2" />
        </div>
        <div className="min-w-0">
          <div className="h-12 animate-pulse rounded-xl bg-surface-2" />
          <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {["a", "b", "c", "d", "e", "f"].map((k) => (
              <li
                key={k}
                className="h-[27rem] animate-pulse rounded-card border border-line bg-surface-2"
              />
            ))}
          </ul>
        </div>
      </div>
    </Container>
  );
}
