/**
 * Contact-detail stripping.
 *
 * Two failure modes matter and they pull in opposite directions: letting a
 * Telegram handle through takes the deal off the platform, and redacting a
 * channel handle or a price makes the product unusable. Both are tested.
 */
import { mentionsOffPlatform, redactContactDetails } from "@/lib/redact";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failures++;
}

/** The message must come out changed, and for the stated reason. */
function blocks(label: string, input: string, kind?: string) {
  const result = redactContactDetails(input);
  const changed = result.body !== input && result.kinds.length > 0;
  check(
    label,
    changed && (!kind || result.kinds.includes(kind as never)),
    changed ? result.body.slice(0, 58) : "LET THROUGH UNCHANGED",
  );
}

/** The message must come out exactly as it went in. */
function allows(label: string, input: string) {
  const result = redactContactDetails(input);
  check(
    label,
    result.body === input && result.kinds.length === 0,
    result.body === input ? "" : `mangled to: ${result.body.slice(0, 58)}`,
  );
}

console.log("— things that must not get through —");
blocks("a plain email", "mail me at johndoe@gmail.com", "an email address");
blocks("an email spelled out", "reach me: johndoe at gmail dot com");
blocks("an email with brackets", "john [at] proton [dot] me");
blocks("a phone number", "my number is +44 7700 900123", "a phone number");
blocks("a bare long number", "call 07700900123");
blocks("a spaced-out number", "9 8 7 6 5 4 3 2 1 0");
blocks("digits written as words", "seven seven zero zero nine zero zero one");
blocks(
  "a telegram invite",
  "here: https://t.me/joinchat/AAAA",
  "a messaging handle",
);
blocks("a whatsapp link", "wa.me/447700900123");
blocks("a bare domain", "see mysite.com for proof", "a link");
blocks("a full url", "proof at https://drive.google.com/file/abc");
blocks(
  "a handle offered as a contact",
  "add me on telegram @dealmaker99",
  "a messaging handle",
);
blocks("a discord invite", "discord.gg/abcdef");

console.log("\n— things that must still work —");
allows(
  "talking about the listing handle",
  "Is @PetPatrolShorts still available?",
);
allows(
  "a channel handle with a platform word nearby but no contact intent",
  "The channel @QuietCookery has 312,000 subscribers.",
);
allows("a price", "I can do $15,800 today.");
allows("a large price with separators", "It sold for $1,250,000 last year.");
allows("subscriber counts", "It has 312000 subscribers and 45000 views.");
allows("a normal question", "How long has the channel been monetized?");
allows(
  "a sentence about escrow",
  "I would rather use escrow than pay up front, is that fine?",
);
allows("dates and percentages", "Engagement is 7.4% over the last 28 days.");

console.log("\n— the original is never kept —");
const swap = redactContactDetails("ping me on telegram @sneaky and at a@b.com");
check(
  "every detail is gone from the stored body",
  !swap.body.includes("@sneaky") && !swap.body.includes("a@b.com"),
  swap.body,
);
check(
  "and both kinds are recorded",
  swap.kinds.length >= 2,
  swap.kinds.join(", "),
);

console.log("\n— intent is visible even with nothing to strip —");
check(
  "asking to move to telegram is noticed",
  mentionsOffPlatform("can we continue on telegram?"),
);
check(
  "asking to be emailed is noticed",
  mentionsOffPlatform("just email me the details"),
);
check(
  "an ordinary question is not",
  !mentionsOffPlatform("what is the monthly revenue?"),
);

console.log("\n— it does not mangle what it leaves —");
const mixed = redactContactDetails(
  "The channel @QuietCookery is great. Email me at bob@x.com to discuss.",
);
check(
  "the legitimate part survives",
  mixed.body.includes("@QuietCookery") && mixed.body.includes("The channel"),
  mixed.body,
);
check("and the email does not", !mixed.body.includes("bob@x.com"));

console.log("");
console.log("— a line break is not an escape hatch —");
blocks(
  "a keyword and a handle split across lines",
  `add me on telegram
@dealmaker99`,
  "a messaging handle",
);
allows(
  "a handle on its own line with no contact intent",
  `The channel is doing well.
@QuietCookery grew 12% last month.`,
);

console.log(
  `\n${failures === 0 ? "all checks passed" : `${failures} FAILED`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
