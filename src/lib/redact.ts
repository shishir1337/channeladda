/**
 * Strips contact details out of a message before it is stored.
 *
 * The point is not to police language. It is that a buyer and a seller who
 * swap a Telegram handle finish the deal off the platform, where there is no
 * escrow, no record and no way to resolve a dispute — and the person who gets
 * hurt is whichever of them was honest.
 *
 * Two rules shape everything here:
 *
 * 1. **Redact, do not reject.** A rejected message teaches people to obfuscate
 *    harder. A redacted one goes through, both sides see the gap, and staff
 *    see the attempt.
 * 2. **Never store the original.** Keeping it would put the private channel
 *    back in the database.
 *
 * This will not catch everything, and it is not meant to be the only defence —
 * flagged conversations go to staff, who can act on the pattern rather than
 * the string.
 */

export type RedactionKind =
  | "an email address"
  | "a phone number"
  | "a link"
  | "a messaging handle";

export type Redaction = {
  /** Safe to store and show. */
  body: string;
  /** What was taken out, for staff. Empty when the message was clean. */
  kinds: RedactionKind[];
};

const MARKER = "[contact details removed]";

/** Platforms people move a deal to. Also the hint that an @handle is a contact. */
const OFF_PLATFORM =
  /\b(telegram|whats?app|signal|discord|skype|wechat|viber|insta\s?dm|dm\s+me|email\s+me|mail\s+me|call\s+me|text\s+me|phone\s+me|contact\s+me\s+(on|at)|reach\s+me\s+(on|at))\b/i;

/**
 * Each rule replaces its match with the marker. Order matters: the more
 * specific patterns run first so a URL is not half-eaten by the email rule.
 */
const RULES: { kind: RedactionKind; pattern: RegExp }[] = [
  // t.me/x, wa.me/x, discord.gg/x — the direct invite links.
  {
    kind: "a messaging handle",
    pattern: /\b(?:t\.me|wa\.me|discord\.gg|join\.skype\.com)\/\S+/gi,
  },
  // Written-out emails: "name at gmail dot com", "name [at] gmail [dot] com".
  {
    kind: "an email address",
    pattern:
      /\b[a-z0-9._%+-]+\s*(?:@|\[\s*at\s*\]|\(\s*at\s*\)|\s+at\s+)\s*[a-z0-9.-]+\s*(?:\.|\[\s*dot\s*\]|\(\s*dot\s*\)|\s+dot\s+)\s*[a-z]{2,}\b/gi,
  },
  // Any URL or bare domain.
  {
    kind: "a link",
    pattern:
      /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|me|co|xyz|app|gg|ru|in)\b(?:\/\S*)?/gi,
  },
  // Phone numbers: an international prefix, or a long run of digits that has
  // been spaced or dashed apart to dodge a plain-digit check.
  {
    kind: "a phone number",
    pattern:
      /(?:\+\d[\d\s().-]{7,}\d)|(?:\b\d[\d\s().-]{9,}\d\b)|(?:\b\d{10,15}\b)/g,
  },
];

/**
 * `@handle` is only a contact when its own sentence is about a messaging app.
 * Listings *are* handles — "@PetPatrolShorts" is the subject of the
 * conversation, not an attempt to leave it.
 */
const HANDLE = /@[a-z0-9._-]{3,}/gi;

/**
 * Sentences, split so the pieces rejoin into exactly the original string.
 *
 * A handle is judged by the sentence it sits in rather than by a window of
 * characters around it. "The channel @QuietCookery is great. Email me at
 * bob@x.com" puts the two in separate thoughts, and any window wide enough to
 * catch "on telegram @dealmaker" also reaches across that full stop and
 * redacts the channel both people are there to discuss.
 */
const SENTENCE = /[^.!?\n]+[.!?\n]*/g;

/**
 * How much of the previous sentence still counts. A line break is the cheapest
 * way to put "telegram" and the handle into different sentences, so a keyword
 * at the very end of one sentence still speaks for the start of the next.
 */
const HANDOFF = 20;

/** Digits spelled out to beat a numeric check: "nine eight seven six five". */
const SPELLED_DIGITS =
  /\b(?:zero|one|two|three|four|five|six|seven|eight|nine)(?:\s+(?:zero|one|two|three|four|five|six|seven|eight|nine)){5,}\b/gi;

export type RedactOptions = {
  /**
   * Handles that are the subject of the conversation rather than a way out of
   * it — normally the listing's own. Never redacted.
   */
  allowHandles?: string[];
};

export function redactContactDetails(
  input: string,
  options: RedactOptions = {},
): Redaction {
  let body = input;
  const kinds = new Set<RedactionKind>();

  for (const rule of RULES) {
    body = body.replace(rule.pattern, () => {
      kinds.add(rule.kind);
      return MARKER;
    });
  }

  body = body.replace(SPELLED_DIGITS, () => {
    kinds.add("a phone number");
    return MARKER;
  });

  const allowed = new Set(
    (options.allowHandles ?? []).map((handle) =>
      handle.replace(/^@/, "").toLowerCase(),
    ),
  );

  const sentences = body.match(SENTENCE) ?? [body];
  body = sentences
    .map((sentence, index) => {
      // A handle reads as a contact when its own sentence is about a messaging
      // app, or when the sentence before it ended on one.
      const carried = sentences[index - 1]?.slice(-HANDOFF) ?? "";
      if (!OFF_PLATFORM.test(sentence) && !OFF_PLATFORM.test(carried)) {
        return sentence;
      }
      return sentence.replace(HANDLE, (match) => {
        if (allowed.has(match.slice(1).toLowerCase())) return match;
        kinds.add("a messaging handle");
        return MARKER;
      });
    })
    .join("");

  // Collapse the runs the replacements can leave behind.
  body = body
    .replace(
      new RegExp(`(?:${escapeRegExp(MARKER)}[\\s,.]*){2,}`, "g"),
      `${MARKER} `,
    )
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return { body, kinds: [...kinds] };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when the message mentions moving the conversation elsewhere, even if
 * nothing was redactable. "Add me on Telegram" with no handle is still the
 * behaviour staff want to see.
 */
export function mentionsOffPlatform(input: string): boolean {
  return OFF_PLATFORM.test(input);
}
