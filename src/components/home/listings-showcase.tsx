"use client";

import {
  ArrowRightIcon,
  CircleDollarSignIcon,
  ClockIcon,
  FlameIcon,
  SlidersHorizontalIcon,
  TagIcon,
} from "lucide-react";
import Link from "next/link";
import { ListingCard } from "@/components/home/listing-card";
import { Button } from "@/components/ui/button";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Listing } from "@/data/listings";

const views: {
  id: string;
  label: string;
  icon: typeof FlameIcon;
  select: (all: Listing[]) => Listing[];
}[] = [
  {
    id: "featured",
    label: "Featured",
    icon: FlameIcon,
    // Editorially promoted first — every other badge is derived, so "has a
    // badge" is not a meaningful sort.
    select: (all) =>
      [...all].sort(
        (a, b) =>
          Number(b.tag === "featured") - Number(a.tag === "featured") ||
          b.watching - a.watching,
      ),
  },
  {
    id: "latest",
    label: "Just listed",
    icon: ClockIcon,
    select: (all) => [...all].sort((a, b) => a.listedDaysAgo - b.listedDaysAgo),
  },
  {
    id: "monetized",
    label: "Monetized",
    icon: CircleDollarSignIcon,
    select: (all) =>
      all
        .filter((l) => l.monetized)
        .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue),
  },
  {
    id: "budget",
    label: "Under $10K",
    icon: TagIcon,
    select: (all) =>
      all.filter((l) => l.price < 10_000).sort((a, b) => a.price - b.price),
  },
];

export function ListingsShowcase({ listings }: { listings: Listing[] }) {
  return (
    <Section id="browse" className="scroll-mt-24">
      <Container>
        <SectionHeading
          title="Accounts for sale now"
          description="Every one checked for ownership."
        />

        <Tabs defaultValue="featured" className="mt-8 sm:mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList>
              {views.map((view) => (
                <TabsTrigger key={view.id} value={view.id}>
                  <view.icon aria-hidden="true" />
                  {view.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* A link, not a button: the filters live on the browse page. */}
            <Button
              asChild
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
            >
              <Link href="/browse">
                <SlidersHorizontalIcon aria-hidden="true" className="size-4" />
                All filters
              </Link>
            </Button>
          </div>

          {views.map((view) => {
            const items = view.select(listings).slice(0, 6);
            return (
              <TabsContent
                key={view.id}
                value={view.id}
                className="mt-6 sm:mt-8"
              >
                {/* A row to swipe on a phone, as app stores do: six tall
                    cards stacked were three screens of scrolling. A grid
                    from a tablet up. */}
                <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-3">
                  {items.map((listing) => (
                    <li
                      key={listing.id}
                      className="w-[82%] shrink-0 snap-start sm:w-auto"
                    >
                      <ListingCard listing={listing} />
                    </li>
                  ))}
                </ul>
              </TabsContent>
            );
          })}
        </Tabs>

        <div className="mt-9 flex justify-center sm:mt-12">
          <Button
            asChild
            variant="secondary"
            size="lg"
            className="w-full sm:w-auto"
          >
            <Link href="/browse">
              View all listings
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}
