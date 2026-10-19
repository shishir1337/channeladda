import type { Platform } from "@/generated/prisma/enums";

/**
 * The account itself, on its own platform, for the chat header.
 *
 * The URL is whatever the seller pasted, so it becomes an href only when it
 * is https and points at the platform the listing claims: a buyer clicking
 * "Open on YouTube" must land on YouTube, never on a lookalike page asking
 * them to sign in. A website can live on any host, so for those https is
 * the whole check.
 */
const HOSTS: Record<Exclude<Platform, "WEBSITE">, readonly string[]> = {
  YOUTUBE: ["youtube.com", "youtu.be"],
  INSTAGRAM: ["instagram.com"],
  FACEBOOK: ["facebook.com", "fb.com"],
  TELEGRAM: ["t.me", "telegram.me"],
};

const LABELS: Record<Platform, string> = {
  YOUTUBE: "Open on YouTube",
  INSTAGRAM: "Open on Instagram",
  FACEBOOK: "Open on Facebook",
  TELEGRAM: "Open on Telegram",
  WEBSITE: "Open the website",
};

/** The host itself or any subdomain of it, never a name that merely starts with it. */
function onHost(hostname: string, host: string): boolean {
  return hostname === host || hostname.endsWith(`.${host}`);
}

export function channelLink(
  platform: Platform,
  sourceUrl: string | null,
): { href: string; label: string } | null {
  if (!sourceUrl) return null;

  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  if (platform !== "WEBSITE") {
    const hostname = url.hostname.toLowerCase();
    if (!HOSTS[platform].some((host) => onHost(hostname, host))) return null;
  }

  return { href: url.toString(), label: LABELS[platform] };
}
