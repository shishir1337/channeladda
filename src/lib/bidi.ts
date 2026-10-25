/**
 * Invisible characters that flip the direction text is drawn in.
 *
 * U+202A–U+202E are the embedding and override marks, U+2066–U+2069 the
 * isolates, and U+200E/U+200F the left-to-right and right-to-left marks.
 * None of them is a letter: Arabic and Hebrew are drawn right to left by
 * their own letters, so taking these out leaves real text as it was. What
 * they are used for here is the trick — a name that reads "Support" but is
 * stored as something else, or an offer note that seems to say a different
 * amount from the one typed.
 */
const BIDI_CONTROLS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** The same text, without the direction-changing marks. */
export function stripBidi(text: string): string {
  return text.replace(BIDI_CONTROLS, "");
}
