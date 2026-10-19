import { formatRate } from "@/lib/fees";

/**
 * Help articles are static text, but some of what they say is an admin
 * setting. The badge article said "three times" and "30% lower" in so many
 * words, so changing either in the admin left the help centre describing a
 * badge nobody could buy. Such figures are written as `{name}` and filled at
 * render.
 */
export function fillHelpText(
  text: string,
  values: Record<string, string>,
): string {
  // An unknown name is left as written: a visible "{name}" gets reported,
  // a silently empty gap in a sentence does not.
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(values, name) ? values[name] : whole,
  );
}

/** The badge's figures, as the badge article quotes them. */
export function badgeValues(settings: {
  resellerPointsMultiplier: number;
  resellerDiscountBp: number;
}): Record<string, string> {
  return {
    multiplier: String(settings.resellerPointsMultiplier),
    multiplied250: (250 * settings.resellerPointsMultiplier).toLocaleString(
      "en-US",
    ),
    discount: formatRate(settings.resellerDiscountBp),
  };
}
