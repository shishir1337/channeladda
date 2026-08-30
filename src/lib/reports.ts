/**
 * What a person can report a listing for.
 *
 * Lives in lib rather than in `src/server/reports.ts` because the form that
 * renders these options is a Client Component, and everything under
 * `src/server` is marked `server-only` — importing it from the browser bundle
 * fails the build, which is the point.
 */
export const REPORT_REASONS = [
  "The account is not really theirs",
  "The numbers look faked",
  "It is a scam or bait",
  "Prohibited content",
  "Something else",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
