import { afterEach, expect, test, vi } from "vitest";
import type { Mail } from "@/server/mailer";
import { notify } from "@/server/notifications";
import { seedUser, withCleanDb } from "@/test/db";

// A notification email used to carry its subject and body and nothing else:
// "You have been paid", "Your listing is live", an offer accepted — and no
// way from the email to the page it was about.
const sent: Mail[] = [];
vi.mock("@/server/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/mailer")>()),
  canSendMail: () => true,
  sendMail: async (mail: Mail) => {
    sent.push(mail);
  },
}));

const site = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  sent.length = 0;
  process.env.NEXT_PUBLIC_SITE_URL = site;
});

test(
  "a notification email links to the notification's page and names the button",
  withCleanDb(async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://channeladda.test";
    const user = await seedUser();

    await notify({
      userId: user.id,
      kind: "ORDER",
      title: "You have been paid for CA-1234",
      body: "The price is in your balance.",
      href: "/dashboard/deals/abc",
      email: {
        subject: "You have been paid for CA-1234",
        body: "The price is in your balance.",
      },
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.link).toBe("https://channeladda.test/dashboard/deals/abc");
    expect(sent[0]?.action).toBe("Open the deal");
  }),
);

test(
  "a link the caller chose is kept",
  withCleanDb(async () => {
    const user = await seedUser();

    await notify({
      userId: user.id,
      kind: "ORDER",
      title: "Paid",
      body: "Paid.",
      href: "/dashboard/deals/abc",
      email: {
        subject: "Paid",
        body: "Paid.",
        link: "https://elsewhere.test/x",
        action: "See the receipt",
      },
    });

    expect(sent[0]?.link).toBe("https://elsewhere.test/x");
    expect(sent[0]?.action).toBe("See the receipt");
  }),
);
