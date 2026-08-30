import {
  ArrowRightIcon,
  ClockIcon,
  GavelIcon,
  MailIcon,
  MessagesSquareIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SupportForm } from "@/components/site/support-form";
import { PageHeader } from "@/components/ui/page-header";
import { Container, Section } from "@/components/ui/section";
import { helpArticles } from "@/data/help";

export const metadata: Metadata = {
  title: "Contact support",
  description:
    "Live chat replies in under ten minutes, every day of the year. Disputes are reviewed by a moderator within 24 hours.",
  alternates: { canonical: "/support" },
};

const channels = [
  {
    icon: MessagesSquareIcon,
    title: "Live chat",
    body: "The fastest route for anything about a live order.",
    meta: "Replies in under 10 minutes, 24/7",
  },
  {
    icon: MailIcon,
    title: "Email",
    body: "support@channeladda.com for anything that is not urgent.",
    meta: "Answered within 12 hours",
  },
  {
    icon: GavelIcon,
    title: "Disputes",
    body: "disputes@channeladda.com, or open one from the order page.",
    meta: "Reviewed by a moderator within 24 hours",
  },
];

export default function SupportPage() {
  const quickHelp = helpArticles.slice(0, 4);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Support" }]}
        eyebrow="Support"
        title="Talk to a human"
        description="Most questions are about an order in progress, and those are the ones we answer fastest. Nothing here is a bot."
      />

      <Section>
        <Container>
          <ul className="grid gap-4 sm:grid-cols-3">
            {channels.map((channel) => (
              <li key={channel.title}>
                <div className="flex h-full flex-col rounded-card border border-line bg-surface p-5 sm:p-6">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
                    <channel.icon aria-hidden="true" className="size-5" />
                  </span>
                  <h2 className="mt-4 font-display text-base font-semibold">
                    {channel.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {channel.body}
                  </p>
                  <p className="mt-auto flex items-center gap-1.5 pt-4 text-xs text-verified">
                    <ClockIcon aria-hidden="true" className="size-3.5" />
                    {channel.meta}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-10 lg:grid lg:grid-cols-[1fr_20rem] lg:gap-10">
            <SupportForm />

            <aside className="mt-8 lg:mt-0">
              <div className="rounded-card border border-line bg-surface p-5">
                <h2 className="font-display text-base font-semibold">
                  Answers you might need first
                </h2>
                <ul className="mt-4 flex flex-col gap-1">
                  {quickHelp.map((article) => (
                    <li key={article.slug}>
                      <Link
                        href={`/help/${article.slug}`}
                        className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                      >
                        {article.title}
                        <ArrowRightIcon
                          aria-hidden="true"
                          className="ml-auto size-3.5 shrink-0 opacity-40"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/help"
                  className="mt-3 inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-primary-text transition-colors hover:text-fg"
                >
                  Visit the help centre
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </Link>
              </div>
            </aside>
          </div>
        </Container>
      </Section>
    </>
  );
}
