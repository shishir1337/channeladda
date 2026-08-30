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
          eyebrow="Live marketplace"
          title="Accounts on the block right now"
          description="Ownership verified, analytics screenshots on file, and every seller through KYC before a listing goes live."
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

            <Button variant="outline" size="sm" className="w-full sm:w-auto">
              <SlidersHorizontalIcon aria-hidden="true" className="size-4" />
              All filters
              <span className="ml-1 rounded-md bg-surface-3 px-1.5 py-0.5 text-[0.6875rem] text-muted">
                9
              </span>
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
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((listing) => (
                    <li key={listing.id}>
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
            variant="outline"
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
