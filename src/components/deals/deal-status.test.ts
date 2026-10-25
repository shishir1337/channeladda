import { describe, expect, test } from "vitest";
import {
  confirmFirst,
  confirmLabel,
  confirmYes,
  dealHeadline,
  endWaitCheck,
  holdNote,
  moneyNote,
  STATUS_LABELS,
  STATUS_SHORT,
  statusSentence,
  stepAsk,
  stepDone,
  stepHelp,
  stepTitle,
} from "@/components/deals/deal-status";
import type { Platform } from "@/generated/prisma/enums";
import { templateFor } from "@/lib/deal-templates";

const PLATFORMS: Platform[] = [
  "YOUTUBE",
  "INSTAGRAM",
  "FACEBOOK",
  "TELEGRAM",
  "WEBSITE",
];

test("on a safest deal the money note says the buyer pays the seller directly", () => {
  // Channel Adda takes the admin fee and nothing else; the price goes from
  // the buyer to the seller once our agent holds the channel.
  for (const viewer of ["buyer", "seller", "agent"] as const) {
    const note = moneyNote("SAFEST", viewer);
    expect(note).toMatch(/directly/);
    expect(note).toMatch(/fee/);
    expect(note).not.toMatch(/wallet/);
  }
});

test("on a fastest deal the money note says the seller is paid once our agent is primary owner", () => {
  for (const viewer of ["buyer", "seller", "agent"] as const) {
    const note = moneyNote("FASTEST", viewer);
    expect(note).toMatch(/Channel Adda/);
    expect(note).toMatch(/primary owner/);
    expect(note).not.toMatch(/directly/);
  }
  expect(moneyNote("FASTEST", "seller")).toMatch(/our agent is primary owner/);
});

test("once a fastest seller is paid, nobody is told the money is still held", () => {
  // Found on the seller's deal page: "Channel Adda is holding the buyer's
  // payment" after it had already gone into their wallet.
  for (const viewer of ["buyer", "seller", "agent"] as const) {
    const note = moneyNote("FASTEST", viewer, true);
    expect(note).not.toMatch(/is holding|holds the (price|whole amount)/);
    expect(note).toMatch(/paid/);
  }
  expect(moneyNote("FASTEST", "seller", true)).toMatch(/wallet/);
});

test("a finished safest sale tells the seller the buyer paid them", () => {
  const seller = statusSentence("COMPLETED", "SAFEST", "seller");
  expect(seller).toMatch(/paid you directly/);
  expect(seller).not.toMatch(/wallet/);
});

test("every step of both deals says what it involves, on every platform", () => {
  // An unknown label gets no help rather than a wrong one, so a step added
  // to a template without copy would silently explain nothing.
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    for (const step of templateFor(mode)) {
      for (const platform of PLATFORMS) {
        expect(
          stepHelp(mode, step.label, platform),
          `${mode} ${step.label} ${platform}`,
        ).toBeTruthy();
      }
    }
  }
});

test("only a YouTube deal is told about Google", () => {
  // A Telegram seller told to wait for Google was told something false.
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    for (const platform of PLATFORMS) {
      const texts = [
        ...templateFor(mode).map(
          (s) => stepHelp(mode, s.label, platform) ?? "",
        ),
        ...templateFor(mode).flatMap((s) =>
          (["buyer", "seller", "agent"] as const).flatMap((viewer) =>
            Object.keys(STATUS_LABELS).map(
              (status) =>
                dealHeadline(
                  status as keyof typeof STATUS_LABELS,
                  mode,
                  viewer,
                  s.position,
                  platform,
                ).sentence,
            ),
          ),
        ),
      ];
      const google = texts.some((t) => /Google/.test(t));
      expect(google, `${mode} ${platform}`).toBe(platform === "YOUTUBE");
    }
  }
  expect(holdNote("FASTEST", "TELEGRAM")).not.toMatch(/Google/);
  expect(holdNote("FASTEST", "YOUTUBE")).toMatch(/Google's 7-day wait/);
});

test("our agent verifying a safest channel posts the latest proof for the buyer", () => {
  const help = stepHelp("SAFEST", "Verify the channel", "YOUTUBE") ?? "";
  expect(help).toMatch(/monetization/);
  expect(help).toMatch(/strikes/);
  expect(help).toMatch(/proof/);
});

test("paying the seller points at the seller's details and asks for proof in the chat", () => {
  const help = stepHelp("SAFEST", "Pay the seller", "YOUTUBE") ?? "";
  expect(help).toMatch(/directly/);
  expect(help).toMatch(/details the seller gave on this page/);
  expect(help).toMatch(/chat/);
});

test("a fastest seller is paid at our agent's custody step", () => {
  expect(stepHelp("FASTEST", "Confirm primary ownership", "YOUTUBE")).toMatch(
    /pays the seller/,
  );
});

test("the two Safest payment buttons read exactly as the client asked", () => {
  expect(confirmLabel("Pay the seller")).toBe("Paid");
  expect(confirmLabel("Confirm the payment arrived")).toBe("Received");
});

test("the presses that decide where the money and the channel go ask first", () => {
  // A seller's Received sends their channel to the buyer for good; pressed by
  // mistake before the money arrived, they would lose it unpaid.
  expect(confirmFirst("SAFEST", "Confirm the payment arrived")).toMatch(
    /cannot come back/,
  );
  expect(confirmFirst("SAFEST", "Pay the seller")).toMatch(/sent/);
  // Our agent's last press ends the deal, in both modes.
  expect(confirmFirst("SAFEST", "Make the buyer primary owner")).toMatch(
    /completes the deal/,
  );
  expect(confirmFirst("FASTEST", "Make the buyer primary owner")).toMatch(
    /completes the deal/,
  );
  // On Fastest, custody pays the seller; on Safest the same words do not.
  expect(confirmFirst("FASTEST", "Confirm primary ownership")).toMatch(
    /pays the seller/,
  );
  expect(confirmFirst("SAFEST", "Invite the agent as owner")).toBeUndefined();
});

test("the second press says what is being sworn to, in sentence case", () => {
  expect(confirmYes("Transfer ownership to the buyer")).toBe(
    "Yes, I have transferred it",
  );
  expect(confirmYes("Verify the channel")).toBe("Yes, it checks out");
});

test("deal copy never says 'this chat': the deal page shows it too", () => {
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    for (const step of templateFor(mode)) {
      expect(stepHelp(mode, step.label, "YOUTUBE") ?? "").not.toMatch(
        /this chat/,
      );
      for (const viewer of ["buyer", "seller", "agent"] as const) {
        for (const status of Object.keys(STATUS_LABELS)) {
          expect(
            dealHeadline(
              status as keyof typeof STATUS_LABELS,
              mode,
              viewer,
              step.position,
              "YOUTUBE",
            ).sentence,
          ).not.toMatch(/this chat/);
        }
      }
    }
  }
});

test("every step a person presses has a button that says what they are confirming", () => {
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    for (const step of templateFor(mode).slice(1)) {
      expect(confirmLabel(step.label), `${mode} ${step.label}`).not.toBe(
        "Mark this done",
      );
    }
  }
});

/**
 * Found walking a whole Safest deal in the browser: once the seller had
 * invited the agent, the seller's own page still told them to invite the
 * agent — the status spans several steps, and the headline only knew the
 * status. On Safest one status spans two seller steps and two of the
 * agent's, so the headline follows the open step itself.
 */
describe("the headline follows the open step, not just the status", () => {
  test("once the seller has invited the agent, nobody is told the seller still has to", () => {
    for (const viewer of ["buyer", "seller", "agent"] as const) {
      const h = dealHeadline(
        "AWAITING_CUSTODY",
        "SAFEST",
        viewer,
        3,
        "YOUTUBE",
      );
      expect(h.label).not.toMatch(/seller to hand/i);
      expect(h.sentence).not.toMatch(/^Invite our agent/);
    }
    expect(
      dealHeadline("AWAITING_CUSTODY", "SAFEST", "agent", 3, "YOUTUBE")
        .sentence,
    ).toMatch(/^The seller has handed the channel to you/);
  });

  test("while the seller's step 2 is owed, the seller is asked to invite the agent", () => {
    const h = dealHeadline(
      "AWAITING_CUSTODY",
      "SAFEST",
      "seller",
      2,
      "YOUTUBE",
    );
    // The seller's own badge names their move, not "waiting for the seller".
    expect(h.label).toBe("Invite our agent now");
    expect(h.sentence).toMatch(/owner/);
  });

  test("the seller's two Safest custody steps read differently", () => {
    const add = dealHeadline(
      "AWAITING_CUSTODY",
      "SAFEST",
      "seller",
      2,
      "YOUTUBE",
    );
    const primary = dealHeadline(
      "AWAITING_CUSTODY",
      "SAFEST",
      "seller",
      4,
      "YOUTUBE",
    );
    expect(primary.sentence).toMatch(/primary owner/);
    expect(primary.sentence).not.toBe(add.sentence);
  });

  test("a safest buyer is told to pay the seller directly, and press Paid", () => {
    const buyer = dealHeadline("IN_CUSTODY", "SAFEST", "buyer", 6, "YOUTUBE");
    // Addressed to the buyer, not about "the buyer".
    expect(buyer.label).toBe("Pay the seller now");
    expect(buyer.sentence).toMatch(/directly/);
    expect(buyer.sentence).toMatch(/Paid/);
  });

  test("a safest seller is asked to press Received once the money is in", () => {
    const seller = dealHeadline("IN_CUSTODY", "SAFEST", "seller", 7, "YOUTUBE");
    expect(seller.sentence).toMatch(/Received/);
    const buyer = dealHeadline("IN_CUSTODY", "SAFEST", "buyer", 7, "YOUTUBE");
    expect(buyer.sentence).not.toMatch(/^Pay/);
  });

  test("a safest deal ends with an owner invite, Google's wait, then primary owner", () => {
    const invite = dealHeadline(
      "AWAITING_HANDOVER",
      "SAFEST",
      "agent",
      8,
      "YOUTUBE",
    );
    expect(invite.sentence).toMatch(/^Invite the buyer's account/);
    expect(invite.sentence).toMatch(/Google's 7-day wait/);

    const buyer = dealHeadline(
      "AWAITING_HANDOVER",
      "SAFEST",
      "buyer",
      9,
      "YOUTUBE",
    );
    expect(buyer.label).toBe("You become primary owner next");
    expect(buyer.sentence).toMatch(/^Accept our agent's owner invite/);
    const agent = dealHeadline(
      "AWAITING_HANDOVER",
      "SAFEST",
      "agent",
      9,
      "YOUTUBE",
    );
    expect(agent.sentence).toMatch(/make the buyer primary owner/i);
    expect(agent.sentence).toMatch(/completes the deal/);

    // Nobody waits on Google for an Instagram account.
    expect(
      dealHeadline("AWAITING_HANDOVER", "SAFEST", "buyer", 9, "INSTAGRAM")
        .sentence,
    ).not.toMatch(/Google/);
  });

  test("on Fastest the seller invites our agent, and our agent invites the buyer", () => {
    const seller = dealHeadline(
      "AGENT_VERIFYING",
      "FASTEST",
      "seller",
      2,
      "YOUTUBE",
    );
    expect(seller.label).toMatch(/invite our agent/i);
    expect(seller.sentence).toMatch(/owner/);
    const agent = dealHeadline(
      "AGENT_VERIFYING",
      "FASTEST",
      "agent",
      3,
      "YOUTUBE",
    );
    expect(agent.sentence).toMatch(/invite the buyer/);
    expect(agent.sentence).toMatch(/holding period/);
  });

  test("on Fastest the seller is told making our agent primary owner is when they are paid", () => {
    const seller = dealHeadline(
      "AWAITING_HANDOVER",
      "FASTEST",
      "seller",
      4,
      "YOUTUBE",
    );
    expect(seller.sentence).toMatch(/make our agent primary owner/i);
    expect(seller.sentence).toMatch(/paid/);
  });

  test("on Fastest, once our agent holds the channel, the seller's part is done", () => {
    const seller = dealHeadline(
      "IN_CUSTODY",
      "FASTEST",
      "seller",
      6,
      "YOUTUBE",
    );
    expect(seller.sentence).toMatch(/wallet/);
    const agent = dealHeadline("IN_CUSTODY", "FASTEST", "agent", 6, "YOUTUBE");
    expect(agent.sentence).toMatch(/Make the buyer primary owner/);
  });

  test("while Channel Adda assigns an agent, the headline says so to everyone", () => {
    for (const viewer of ["buyer", "seller"] as const) {
      const h = dealHeadline(
        "AGENT_VERIFYING",
        "FASTEST",
        viewer,
        2,
        "YOUTUBE",
        true,
      );
      expect(h.label).toBe("Channel Adda is assigning an agent");
      expect(h.short.length).toBeLessThanOrEqual(22);
      expect(h.sentence).not.toMatch(/^Invite our agent/);
    }
  });

  test("every headline has a short label that fits a list row", () => {
    for (const mode of ["SAFEST", "FASTEST"] as const) {
      for (const step of templateFor(mode)) {
        for (const viewer of ["buyer", "seller", "agent"] as const) {
          for (const status of Object.keys(STATUS_LABELS)) {
            const h = dealHeadline(
              status as keyof typeof STATUS_LABELS,
              mode,
              viewer,
              step.position,
              "YOUTUBE",
            );
            expect(h.short.length, h.short).toBeLessThanOrEqual(22);
          }
        }
      }
    }
    expect(
      dealHeadline("COMPLETED", "SAFEST", "buyer", null, "YOUTUBE"),
    ).toEqual({
      label: STATUS_LABELS.COMPLETED,
      short: STATUS_SHORT.COMPLETED,
      sentence: statusSentence("COMPLETED", "SAFEST", "buyer"),
    });
  });
});

describe("the badge speaks to whoever is reading it", () => {
  // The owner: a buyer looking at their own deal read "Waiting for the
  // buyer's payment". The buyer and the seller each get their own words;
  // staff and the agent keep the neutral one.
  test("an unpaid deal", () => {
    const label = (viewer: "buyer" | "seller" | "agent") =>
      dealHeadline("AWAITING_PAYMENT", "FASTEST", viewer, 1, "YOUTUBE").label;
    expect(label("buyer")).toBe("Waiting for your payment");
    expect(label("seller")).toBe("Waiting for the buyer to pay");
    expect(label("agent")).toBe(STATUS_LABELS.AWAITING_PAYMENT);
  });

  test("a Safest buyer paying the seller", () => {
    const label = (viewer: "buyer" | "seller" | "agent") =>
      dealHeadline("IN_CUSTODY", "SAFEST", viewer, 6, "YOUTUBE").label;
    expect(label("buyer")).toBe("Pay the seller now");
    expect(label("seller")).toBe("Waiting for the buyer to pay you");
    expect(label("agent")).toBe("Waiting for the buyer to pay the seller");
  });

  test("the seller's own turn says so", () => {
    expect(
      dealHeadline("IN_CUSTODY", "SAFEST", "seller", 7, "YOUTUBE").label,
    ).toBe("Confirm the buyer's payment");
    expect(
      dealHeadline("AGENT_VERIFYING", "FASTEST", "seller", 2, "YOUTUBE").label,
    ).toBe("Invite our agent now");
  });
});

describe("each step is named for whoever is reading it", () => {
  // The owner: "Invite the buyer as owner", "Confirm primary ownership" and
  // "Then our agent" read as the platform's checklist, not as what is going
  // to happen to the person looking. The stored labels stay (running deals
  // are matched on them); only what is shown changes.
  test("every step of both templates has a reader's name", () => {
    for (const mode of ["SAFEST", "FASTEST"] as const) {
      for (const step of templateFor(mode)) {
        for (const viewer of ["buyer", "seller", "agent"] as const) {
          for (const platform of PLATFORMS) {
            const title = stepTitle(step.label, viewer, platform, mode);
            expect(title, `${mode} ${step.label} ${platform}`).not.toBe(
              step.label,
            );
          }
        }
      }
    }
  });

  test("the buyer, the seller and our agent each read their own words", () => {
    const t = (label: string, viewer: "buyer" | "seller" | "agent") =>
      stepTitle(label, viewer, "YOUTUBE", "FASTEST");
    expect(t("Pay the full amount", "buyer")).toBe("You pay");
    expect(t("Pay the full amount", "seller")).toBe("The buyer pays us");
    expect(t("Invite the agent as owner", "seller")).toBe(
      "You invite our agent as owner",
    );
    expect(t("Invite the agent as owner", "buyer")).toBe(
      "The seller invites our agent as owner",
    );
    expect(t("Invite the agent as owner", "agent")).toBe(
      "The seller invites you as owner",
    );
    expect(t("Make the buyer primary owner", "buyer")).toBe(
      "Our agent makes you primary owner",
    );
    expect(t("Make the agent primary owner", "agent")).toBe(
      "The seller makes you primary owner",
    );
  });

  test("staff, and a step from older templates, keep the stored label", () => {
    expect(
      stepTitle("Pay the full amount", "staff", "YOUTUBE", "FASTEST"),
    ).toBe("Pay the full amount");
    expect(
      stepTitle("Release the seller's funds", "buyer", "YOUTUBE", "FASTEST"),
    ).toBe("Release the seller's funds");
  });
});

describe("each platform's deal speaks its own handover", () => {
  // QA, 2026-10-26: Instagram, Telegram, Facebook and website deals told
  // sellers to "invite our agent as owner" and "make our agent primary
  // owner", and asked staff whether "Google already lets the transfer go
  // ahead". None of those exist off YouTube.
  const YOUTUBE_WORDS = /owner invite|primary owner|as owner|Google/;
  const OTHERS = PLATFORMS.filter((p) => p !== "YOUTUBE");
  const VIEWERS = ["buyer", "seller", "agent"] as const;

  test("no step title, help, button or ask uses YouTube's words elsewhere", () => {
    for (const mode of ["SAFEST", "FASTEST"] as const) {
      for (const platform of OTHERS) {
        for (const step of templateFor(mode)) {
          const texts = [
            stepAsk(step.label, platform, mode),
            stepDone(step.label, platform, mode),
            confirmLabel(step.label, platform, mode),
            confirmYes(step.label, platform, mode),
            confirmFirst(mode, step.label, platform) ?? "",
            ...VIEWERS.flatMap((viewer) => [
              stepTitle(step.label, viewer, platform, mode),
              stepHelp(mode, step.label, platform, viewer) ?? "",
              stepHelp(mode, step.label, platform, viewer, true) ?? "",
            ]),
          ];
          for (const text of texts) {
            expect(text, `${mode} ${platform} ${step.label}`).not.toMatch(
              YOUTUBE_WORDS,
            );
          }
        }
      }
    }
  });

  test("no headline uses YouTube's words elsewhere, held or not", () => {
    for (const mode of ["SAFEST", "FASTEST"] as const) {
      for (const platform of OTHERS) {
        for (const step of templateFor(mode)) {
          for (const viewer of VIEWERS) {
            for (const status of Object.keys(STATUS_LABELS)) {
              for (const held of [false, true]) {
                const h = dealHeadline(
                  status as keyof typeof STATUS_LABELS,
                  mode,
                  viewer,
                  step.position,
                  platform,
                  false,
                  held,
                );
                expect(
                  `${h.label} ${h.sentence}`,
                  `${mode} ${platform} ${status} ${step.position} ${viewer}`,
                ).not.toMatch(YOUTUBE_WORDS);
              }
            }
          }
        }
      }
    }
  });

  test("an Instagram seller hands over the login, and our agent secures it", () => {
    expect(
      stepTitle("Invite the agent as owner", "seller", "INSTAGRAM", "FASTEST"),
    ).toBe("You send our agent the login");
    expect(
      stepHelp("FASTEST", "Invite the buyer as owner", "INSTAGRAM", "agent"),
    ).toMatch(/two-factor/);
    expect(
      stepTitle(
        "Make the buyer primary owner",
        "buyer",
        "INSTAGRAM",
        "FASTEST",
      ),
    ).toBe("Our agent moves the account to you");
  });

  test("Telegram and Facebook name their own actions", () => {
    expect(
      stepTitle(
        "Make the agent primary owner",
        "seller",
        "TELEGRAM",
        "FASTEST",
      ),
    ).toBe("You transfer ownership to our agent");
    expect(
      stepTitle("Invite the agent as owner", "agent", "FACEBOOK", "SAFEST"),
    ).toBe("The seller adds you to the Page");
    expect(
      stepHelp("FASTEST", "Make the agent primary owner", "WEBSITE", "seller"),
    ).toMatch(/domain/);
  });

  test("ending a wait early mentions Google only on YouTube", () => {
    expect(endWaitCheck("YOUTUBE", "FASTEST")).toMatch(/Google/);
    for (const platform of OTHERS) {
      expect(endWaitCheck(platform, "FASTEST")).not.toMatch(/Google/);
    }
  });

  test("the chat's record of a step names nobody as you", () => {
    for (const mode of ["SAFEST", "FASTEST"] as const) {
      for (const platform of PLATFORMS) {
        for (const step of templateFor(mode)) {
          expect(stepDone(step.label, platform, mode)).not.toMatch(
            /\byou(r)?\b/i,
          );
        }
      }
    }
  });
});

describe("a step's words are written to whoever reads them", () => {
  // QA: the seller read "The seller invites our agent's account…" under
  // their own step, and our agent read "Our agent accepts…".
  test("whoever does the step is told what to do, not told about themselves", () => {
    for (const mode of ["SAFEST", "FASTEST"] as const) {
      for (const platform of PLATFORMS) {
        for (const step of templateFor(mode)) {
          const help = stepHelp(mode, step.label, platform, step.actor) ?? "";
          expect(help, `${mode} ${platform} ${step.label}`).not.toMatch(
            /^(The seller|Our agent|The buyer)\b/,
          );
        }
      }
    }
    expect(
      stepHelp("FASTEST", "Invite the agent as owner", "YOUTUBE", "seller"),
    ).toMatch(/^Invite our agent's Google account/);
    expect(
      stepHelp("SAFEST", "Accept the owner invite", "YOUTUBE", "agent"),
    ).toMatch(/^Accept the seller's invite/);
  });

  test("the buyer reads about their own account as theirs", () => {
    expect(
      stepHelp("FASTEST", "Make the buyer primary owner", "YOUTUBE", "buyer"),
    ).toMatch(/your Google account/);
  });

  test("while the wait runs, the step after it says it waits", () => {
    expect(
      stepHelp(
        "FASTEST",
        "Make the agent primary owner",
        "YOUTUBE",
        "seller",
        true,
      ),
    ).toMatch(/^When the holding period ends, make our agent's/);
  });

  test("the agent's own step is headed as their move", () => {
    const h = dealHeadline("AWAITING_CUSTODY", "SAFEST", "agent", 3, "YOUTUBE");
    expect(h.label).toBe("Accept the owner invite now");
  });

  test("once the holding period is over, nobody is told to wait for it", () => {
    for (const viewer of ["buyer", "seller", "agent"] as const) {
      const over = dealHeadline(
        "AWAITING_HANDOVER",
        "FASTEST",
        viewer,
        4,
        "YOUTUBE",
        false,
        false,
      );
      expect(over.sentence, viewer).not.toMatch(/When the holding period ends/);
      expect(over.sentence, viewer).toMatch(/holding period is over/);
      const running = dealHeadline(
        "AWAITING_HANDOVER",
        "FASTEST",
        viewer,
        4,
        "YOUTUBE",
        false,
        true,
      );
      expect(running.sentence, viewer).not.toMatch(/is over/);
    }
  });

  test("no deal promises an email: we tell you, in the app and by email", () => {
    for (const mode of ["SAFEST", "FASTEST"] as const) {
      for (const platform of PLATFORMS) {
        expect(holdNote(mode, platform)).not.toMatch(/email/);
        for (const step of templateFor(mode)) {
          for (const held of [false, true]) {
            for (const viewer of ["buyer", "seller", "agent"] as const) {
              for (const status of Object.keys(STATUS_LABELS)) {
                expect(
                  dealHeadline(
                    status as keyof typeof STATUS_LABELS,
                    mode,
                    viewer,
                    step.position,
                    platform,
                    false,
                    held,
                  ).sentence,
                ).not.toMatch(/we email/i);
              }
            }
          }
        }
      }
    }
  });

  test("the seller handing full control to our agent asks first, on every platform", () => {
    for (const mode of ["SAFEST", "FASTEST"] as const) {
      for (const platform of PLATFORMS) {
        expect(
          confirmFirst(mode, "Make the agent primary owner", platform),
          `${mode} ${platform}`,
        ).toMatch(/cannot take/);
      }
    }
  });
});
