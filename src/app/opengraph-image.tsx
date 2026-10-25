import { ImageResponse } from "next/og";

/**
 * The picture a link to the site shows when it is shared — in WhatsApp, on
 * Telegram, on X — for every page that has none of its own. A listing with
 * an uploaded cover uses that instead (see the listing page).
 *
 * Drawn rather than a file so it stays in step with the mark in the header.
 * Built once at deploy: nothing in it changes per request.
 */
export const alt =
  "Channel Adda — the supervised marketplace for social media accounts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#f4f4f5";
const MUTED = "#a1a1aa";
const BG = "#09090b";
const LINE = "#27272a";
const GOLD = "#ffb020";
const GOLD_INK = "#1a1204";

const PLATFORMS = [
  { name: "YouTube", tint: "#ff4062" },
  { name: "Instagram", tint: "#f4589b" },
  { name: "Facebook", tint: "#4d94ff" },
  { name: "Telegram", tint: "#46b6e8" },
  { name: "Websites", tint: "#23c98a" },
];

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: BG,
        color: INK,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="72" height="72" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="9" fill={GOLD} />
          <path
            d="M7 21.5 9.4 11l4.1 6 3-6 4.1 6L23 11l2 10.5"
            stroke={GOLD_INK}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <circle cx="16" cy="8.5" r="1.9" fill={GOLD_INK} />
        </svg>
        <div style={{ display: "flex", fontSize: 44, letterSpacing: -1 }}>
          <span>Channel</span>
          <span style={{ color: GOLD, marginLeft: 12 }}>Adda</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            display: "flex",
            fontSize: 68,
            lineHeight: 1.08,
            letterSpacing: -2,
            maxWidth: 980,
          }}
        >
          Buy and sell social media accounts, safely
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 30,
            lineHeight: 1.35,
            color: MUTED,
            maxWidth: 1040,
          }}
        >
          An agent holds the account or the money until the handover is done.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 14,
          borderTop: `1px solid ${LINE}`,
          paddingTop: 32,
        }}
      >
        {PLATFORMS.map((platform) => (
          <div
            key={platform.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 24,
              color: INK,
              border: `1px solid ${LINE}`,
              borderRadius: 999,
              padding: "10px 20px",
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: platform.tint,
              }}
            />
            {platform.name}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
