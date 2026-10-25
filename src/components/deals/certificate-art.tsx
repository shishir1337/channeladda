import type { Platform } from "@/generated/prisma/enums";
import { SITE_TIME_LABEL, siteDate } from "@/lib/site-time";
import type { Certificate } from "@/server/certificate";

/**
 * The certificate as a picture, for `next/og` to draw.
 *
 * Inline styles and flex only: that is all the renderer understands, so
 * this is not built from the app kit. A4 landscape proportions, so the PDF
 * made from it fills the page. One typeface in one weight (the renderer's
 * own), so size and colour carry the hierarchy.
 */
export const CERTIFICATE_SIZE = { width: 1600, height: 1131 } as const;

const INK = "#18181b";
const MUTED = "#5b6270";
const SUBTLE = "#8a909c";
const LINE = "#e4dfd3";
const PAPER = "#fffdf8";
const GREEN = "#0c8a57";
const GOLD = "#ffb020";
const GOLD_INK = "#1a1204";

const PLATFORM_NAME: Record<Platform, string> = {
  YOUTUBE: "YouTube",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TELEGRAM: "Telegram",
  WEBSITE: "Website",
};

/**
 * In the site's time zone, not the server's: rendered on a UTC server, a
 * deal finished on the evening of 26 October in Kolkata said 25 October.
 */
const day = (date: Date) => siteDate(date);

/**
 * The renderer widens the space after a word with an "fi" in it, and after
 * letter-spaced capitals — "Certificate  of", "INSTAGRAM  ACCOUNT". A
 * no-break space is measured correctly, so one-line text uses those, and
 * the paragraph uses one only after an "fi" or "fl" word, so it still wraps.
 */
export const tight = (text: string) => text.replace(/ /g, "\u00a0");
export const ligatureSafe = (text: string) =>
  text.replace(/(\S*f[il]\S*) /gi, "$1\u00a0");

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

/** Cut to fit one line: the renderer has no ellipsis of its own to trust. */
const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

export function CertificateArt({
  certificate: c,
  checkAt,
}: {
  certificate: Certificate;
  /** Where to check it, without the scheme: "channeladda.com/certificate/…". */
  checkAt: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#f3efe6",
        padding: 36,
        fontSize: 24,
        color: INK,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: PAPER,
          border: `3px solid ${GREEN}`,
          borderRadius: 28,
          padding: "60px 84px 56px",
        }}
      >
        {/* A second, finer frame inside the first. */}
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            right: 14,
            bottom: 14,
            border: `1.5px solid ${GREEN}55`,
            borderRadius: 18,
          }}
        />

        {/* ---- who issued it, and its number ---------------------------- */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="56" height="56" viewBox="0 0 32 32" aria-hidden="true">
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
            <div style={{ display: "flex", fontSize: 34, letterSpacing: -0.5 }}>
              <span>Channel</span>
              <span style={{ color: "#96590a", marginLeft: 8 }}>Adda</span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
            }}
          >
            <span style={{ fontSize: 18, color: SUBTLE, letterSpacing: 2 }}>
              {tight("CERTIFICATE NO.")}
            </span>
            <span style={{ fontSize: 26, marginTop: 4, letterSpacing: 1 }}>
              {c.code}
            </span>
          </div>
        </div>

        {/* ---- what it says ---------------------------------------------- */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 52,
          }}
        >
          <span style={{ fontSize: 20, color: GREEN, letterSpacing: 6 }}>
            {tight("VERIFIED TRANSFER")}
          </span>
          <span style={{ fontSize: 68, marginTop: 14, letterSpacing: -1.5 }}>
            {tight("Certificate of Transfer")}
          </span>
          <span
            style={{
              fontSize: 24,
              color: MUTED,
              marginTop: 16,
              textAlign: "center",
              maxWidth: 1080,
            }}
          >
            {ligatureSafe(
              "This certifies that the account below changed hands through Channel Adda, with a Channel Adda agent supervising the handover.",
            )}
          </span>
        </div>

        {/* ---- the account ----------------------------------------------- */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 40,
            padding: "28px 40px",
            border: `1.5px solid ${LINE}`,
            borderRadius: 20,
            background: "#ffffff",
          }}
        >
          <span style={{ fontSize: 20, color: SUBTLE, letterSpacing: 2 }}>
            {tight(`${PLATFORM_NAME[c.platform].toUpperCase()} ACCOUNT`)}
          </span>
          <span style={{ fontSize: 50, marginTop: 8, letterSpacing: -1 }}>
            {clip(c.handle, 40)}
          </span>
          <span style={{ fontSize: 22, color: MUTED, marginTop: 6 }}>
            {tight(clip(c.title, 80))}
          </span>
        </div>

        {/* ---- from whom, to whom --------------------------------------- */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            marginTop: 36,
            gap: 40,
          }}
        >
          <Party label="FROM THE SELLER" name={c.sellerName} />
          <svg width="56" height="24" viewBox="0 0 56 24" aria-hidden="true">
            <path
              d="M2 12h48m-10-9 10 9-10 9"
              stroke={GREEN}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <Party label="TO THE BUYER" name={c.buyerName} />
        </div>

        {/* ---- the facts ------------------------------------------------- */}
        <div
          style={{
            display: "flex",
            marginTop: 40,
            borderTop: `1.5px solid ${LINE}`,
            paddingTop: 28,
          }}
        >
          <Fact label="Completed on" value={day(c.completedAt)} />
          <Fact label="Price" value={usd(c.priceUsd)} />
          <Fact
            label="Deal type"
            value={c.mode === "SAFEST" ? "Safest" : "Fastest"}
          />
          <Fact label="Deal reference" value={c.reference} />
        </div>

        {/* ---- how to check it ------------------------------------------ */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: "auto",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 20, color: SUBTLE }}>
              {tight("Check this certificate at")}
            </span>
            <span style={{ fontSize: 24, marginTop: 6 }}>{checkAt}</span>
            <span style={{ fontSize: 18, color: SUBTLE, marginTop: 10 }}>
              {tight(
                `Deal opened ${day(c.openedAt)}${c.paidAt ? ` · Payment received ${day(c.paidAt)}` : ""} · Dates in ${SITE_TIME_LABEL}`,
              )}
            </span>
          </div>
          {/* The seal. */}
          <div
            style={{
              width: 132,
              height: 132,
              borderRadius: 66,
              border: `3px solid ${GREEN}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 108,
                height: 108,
                borderRadius: 54,
                background: GREEN,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="44"
                height="44"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="m5 12.5 4.5 4.5L19 7.5"
                  stroke="#ffffff"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
              <span
                style={{ fontSize: 13, color: "#ffffff", letterSpacing: 1.5 }}
              >
                VERIFIED
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Party({ label, name }: { label: string; name: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: 520,
      }}
    >
      <span style={{ fontSize: 18, color: SUBTLE, letterSpacing: 2 }}>
        {tight(label)}
      </span>
      <span style={{ fontSize: 36, marginTop: 6 }}>
        {tight(clip(name, 28))}
      </span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <span style={{ fontSize: 18, color: SUBTLE, letterSpacing: 1 }}>
        {tight(label.toUpperCase())}
      </span>
      <span style={{ fontSize: 28, marginTop: 6 }}>{tight(value)}</span>
    </div>
  );
}

/** What the certificate says, line by line, for the PDF's text layer. */
export function certificateText(c: Certificate, checkAt: string): string[] {
  return [
    "Channel Adda - Certificate of Transfer",
    `Certificate no. ${c.code}`,
    "This certifies that the account below changed hands through Channel Adda, with a Channel Adda agent supervising the handover.",
    `${PLATFORM_NAME[c.platform]} account: ${c.handle}`,
    c.title,
    `From the seller: ${c.sellerName}`,
    `To the buyer: ${c.buyerName}`,
    `Completed on ${day(c.completedAt)} (${SITE_TIME_LABEL})`,
    `Price: ${usd(c.priceUsd)}`,
    `Deal type: ${c.mode === "SAFEST" ? "Safest" : "Fastest"}`,
    `Deal reference: ${c.reference}`,
    `Check this certificate at ${checkAt}`,
  ];
}
