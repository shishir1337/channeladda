import "server-only";

import {
  PAGE_HEADERS,
  type PublicTelegramChannel,
  parseTelegramPage,
  parseTelegramPostViews,
  postReachPercent,
} from "@/lib/channel-pages";

/**
 * A Telegram channel's public facts, from t.me.
 *
 * Telegram has no API for reading somebody else's channel, but the page
 * t.me/<name> prints the channel's name, picture and exact member count for
 * anyone, and t.me/s/<name> shows its recent posts with their views. That is
 * the same thing a buyer would look at, so it is what fills the form in.
 *
 * Only ever fetches t.me, with the name checked against Telegram's own rules
 * first — a pasted link never decides where this server connects.
 */
export class TelegramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramError";
  }
}

/** Telegram's rule for public names: 5–32 letters, digits or underscores. */
const PUBLIC_NAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

async function page(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: PAGE_HEADERS,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new TelegramError(`Telegram answered ${response.status}.`);
  }
  return response.text();
}

export async function fetchTelegramChannel(name: string): Promise<{
  channel: PublicTelegramChannel;
  /** Average post views as a share of members, when there are posts. */
  reach: number | null;
}> {
  if (!PUBLIC_NAME.test(name)) {
    // joinchat/…, +invite codes and the like: private, so there is nothing
    // public to read and nothing a buyer could check either.
    throw new TelegramError(
      "That is not a public channel link. Paste the t.me/name link from the channel's info.",
    );
  }

  const channel = parseTelegramPage(await page(`https://t.me/${name}`));
  if (!channel) {
    throw new TelegramError(
      "No public Telegram channel has that name. Check the link opens in a browser.",
    );
  }
  if (channel.kind === "person") {
    throw new TelegramError(
      "That is a person's profile, not a channel or group.",
    );
  }

  // The preview is only for channels, and only for public ones with posts.
  // Missing it costs the engagement estimate and nothing else.
  let reach: number | null = null;
  if (channel.kind === "channel" && channel.members) {
    try {
      const views = parseTelegramPostViews(
        await page(`https://t.me/s/${name}`),
      );
      reach = postReachPercent(views, channel.members);
    } catch {
      reach = null;
    }
  }

  return { channel, reach };
}
