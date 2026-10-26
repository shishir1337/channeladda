import {
  ArrowRightIcon,
  ClockIcon,
  GavelIcon,
  MailIcon,
  MessagesSquareIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SupportForm } from "@/components/site/support-form";
import { iconTile } from "@/components/ui/icon-hue";
import { PageHeader } from "@/components/ui/page-header";
import { Container, Section } from "@/components/ui/section";
import { helpArticles } from "@/data/help";
import { CONTACT_EMAIL, pageMetadata } from "@/lib/seo";
import {
  ESCROW_AGENT_HREF,
  ESCROW_AGENT_NAME,
  REPLY_PROMISE,
} from "@/lib/support-chat";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = pageMetadata({
  title: "Contact support",
  description:
    "Write to a person on our support team. Email is answered within 12 hours, and disputes are reviewed by a moderator within 24 hours.",
  path: "/support",
});

const channels: {
  icon: typeof MailIcon;
  title: string;
  body: string;
  meta: string;
  link?: { href: string; label: string };
}[] = [
  {
    // Signed-in members chat with the team from Messages. The form below
    // stays for everyone else — above all, people who cannot sign in.
    icon: ShieldCheckIcon,
    title: `Chat with an ${ESCROW_AGENT_NAME}`,
    body: `Signed in? Open Messages and write to the ${ESCROW_AGENT_NAME}, pinned at the top. A Channel Adda agent will help.`,
    meta: REPLY_PROMISE,
    link: { href: ESCROW_AGENT_HREF, label: "Open the chat" },
  },
  {
    icon: MessagesSquareIcon,
    title: "The form below",
    body: "For anyone, signed in or not. About a live order? Add the order reference and we start from it.",
    meta: "Read by a person, never a bot",
  },
  {
    icon: MailIcon,
    title: "Email",
    body: "For anything that is not urgent.",
    meta: "Answered within 12 hours",
    link: { href: `mailto:${CONTACT_EMAIL}`, label: CONTACT_EMAIL },
  },
  {
    icon: GavelIcon,
    title: "Disputes",
    body: `Open one from the order page, or write to ${CONTACT_EMAIL}.`,
    meta: "Reviewed by a moderator within 24 hours",
  },
];

export default async function SupportPage({
  searchParams,
}: PageProps<"/support">) {
  const quickHelp = helpArticles.slice(0, 4);

  // requireUser sends a suspended account here with this reason, and the
  // page used to ignore it entirely — so someone ejected from their own
  // dashboard landed on a generic contact page with no idea why.
  const params = await searchParams;
  const suspended = params.reason === "account-suspended";
  // Pages link here with a topic preselected — the two-factor page does —
  // and the form used to ignore it.
  const topic = typeof params.topic === "string" ? params.topic : undefined;
  // A page that sends somebody here may say what they wanted ("Add funds"),
  // and a signed-in member is not asked for the email we already have.
  const message =
    typeof params.message === "string"
      ? params.message.slice(0, 500)
      : undefined;
  const me = await getCurrentUser();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Support" }]}
        title={suspended ? "Your account is suspended" : "Talk to a human"}
        description={
          suspended
            ? "You cannot sign in to your dashboard while a suspension is in place. Tell us below what you were doing and we will look at it — a moderator reads every one of these, and a suspension that was a mistake is lifted the same day."
            : "Most questions are about an order in progress, and those are the ones we answer fastest. Nothing here is a bot."
        }
      />

      <Section>
        <Container>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {channels.map((channel) => (
              <li key={channel.title}>
                <div className="flex h-full flex-col rounded-card border border-line bg-surface p-5 sm:p-6">
                  <span
                    className={`flex size-9 items-center justify-center rounded-lg border ${iconTile(channel.icon)}`}
                  >
                    <channel.icon aria-hidden="true" className="size-4.5" />
                  </span>
                  <h2 className="mt-4 text-[0.9375rem] font-semibold text-fg">
                    {channel.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {channel.body}
                  </p>
                  {channel.link ? (
                    <Link
                      href={channel.link.href}
                      className="mt-3 inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-fg transition-colors duration-150 hover:text-muted"
                    >
                      {channel.link.label}
                      <ArrowRightIcon aria-hidden="true" className="size-4" />
                    </Link>
                  ) : null}
                  <p className="mt-auto flex items-center gap-1.5 pt-4 text-[0.8125rem] text-subtle">
                    <ClockIcon aria-hidden="true" className="size-3.5" />
                    {channel.meta}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-10 lg:grid lg:grid-cols-[1fr_20rem] lg:gap-10">
            <SupportForm
              topic={topic}
              message={message}
              member={me ? { name: me.name, email: me.email } : undefined}
            />

            {/* A named section, not an aside: inside the page's main an
                aside is a landmark in the wrong place. */}
            <section
              aria-labelledby="quick-help-heading"
              className="mt-8 lg:mt-0"
            >
              <div className="rounded-card border border-line bg-surface p-5">
                <h2
                  id="quick-help-heading"
                  className="text-[0.9375rem] font-semibold text-fg"
                >
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
                  className="mt-3 inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-fg transition-colors duration-150 hover:text-muted"
                >
                  Visit the help centre
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </Link>
              </div>
            </section>
          </div>
        </Container>
      </Section>
    </>
  );
}
