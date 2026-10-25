import { siteUrl } from "@/lib/site-url";

/**
 * The one layout every Channel Adda email is sent in.
 *
 * The brand as the site shows it — the gold mark, "Channel Adda" with the
 * deep-gold "Adda", true neutrals, gold as the one action colour — in the
 * few things every mail client renders: tables, inline styles, a single
 * image. No web fonts, no tracking pixels and no second image: it is still a
 * transactional email, and the one that looks like a newsletter is the one a
 * spam filter holds back.
 */
export type EmailContent = {
  subject: string;
  /**
   * The heading inside the email. Defaults to the subject; set it where the
   * subject would say the wrong thing twice ("123456 is your code" above
   * the code).
   */
  heading?: string;
  body: string;
  /** The button's target, also written out below it for a client that drops the button. */
  link?: string;
  /** What the button says. Defaults to "Open Channel Adda". */
  action?: string;
  /** A code to type on the site, set large so it reads at a glance. */
  code?: string;
};

// The site's light tokens (globals.css), as hex: mail clients know no
// custom properties.
const PAGE = "#f4f4f5";
const CARD = "#ffffff";
const BORDER = "#e8e8eb";
const FG = "#18181b";
const MUTED = "#52525b";
const SUBTLE = "#71717a";
const GOLD = "#ffb020";
const GOLD_FG = "#1a1204";
const GOLD_TEXT = "#96590a";
const GOLD_SOFT = "#fff6e3";

const FONT =
  "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";

const DEFAULT_ACTION = "Open Channel Adda";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphsOf(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * The line an inbox shows beside the subject: the first one with news in
 * it. "Hi Rafi," is what most of these open with, and it says nothing.
 */
function preheaderOf(body: string): string {
  const line =
    paragraphsOf(body).find((p) => !/^(hi|hello|dear)\b[^\n]*,$/i.test(p)) ??
    "";
  const flat = line.replace(/\s+/g, " ");
  return flat.length > 140 ? `${flat.slice(0, 139).trimEnd()}…` : flat;
}

/** The button for a notification, named for the page it opens. */
export function emailAction(href: string): string {
  const path = href.replace(/^https?:\/\/[^/]+/, "");
  if (/^\/dashboard\/deals(\/|$)/.test(path)) return "Open the deal";
  if (/^\/dashboard\/messages(\/|$)/.test(path)) return "Open the conversation";
  if (/^\/dashboard\/offers/.test(path)) return "See your offers";
  if (/^\/dashboard\/wallet/.test(path)) return "Open your wallet";
  if (/^\/dashboard\/listings\/./.test(path)) return "Open your listing";
  if (/^\/dashboard\/listings/.test(path)) return "Open your listings";
  if (/^\/dashboard\/verification/.test(path)) return "Open verification";
  if (/^\/listing\//.test(path)) return "View the listing";
  if (/^\/admin(\/|$)/.test(path)) return "Open in admin";
  return DEFAULT_ACTION;
}

export function emailHtml(mail: EmailContent): string {
  const site = siteUrl();
  const host = site.replace(/^https?:\/\//, "");
  const heading = escapeHtml(mail.heading ?? mail.subject);

  const paragraphs = paragraphsOf(mail.body)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${MUTED}">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  const code = mail.code
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr>` +
      `<td style="background:${GOLD_SOFT};border-radius:12px;padding:14px 22px;font-family:${MONO};font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px;color:${GOLD_FG}">${escapeHtml(mail.code)}</td>` +
      `</tr></table>`
    : "";

  const href = mail.link ? escapeHtml(mail.link) : "";
  const button = mail.link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr>` +
      `<td bgcolor="${GOLD}" style="background:${GOLD};border-radius:10px">` +
      `<a href="${href}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:${GOLD_FG};text-decoration:none;border-radius:10px">${escapeHtml(mail.action ?? DEFAULT_ACTION)}</a>` +
      `</td></tr></table>` +
      `<p style="margin:0;font-size:13px;line-height:20px;color:${SUBTLE}">If the button does not work, paste this link into your browser:<br>` +
      `<a href="${href}" style="color:${GOLD_TEXT};word-break:break-all">${href}</a></p>`
    : "";

  // Zero-width padding after the preview text, so an inbox does not fill the
  // rest of the line with the start of the body.
  const spacer = "&#847;&zwnj;&nbsp;".repeat(40);

  return (
    `<!doctype html><html lang="en"><head>` +
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="x-apple-disable-message-reformatting">` +
    // Light only: the palette is the site's light theme, and a client that
    // half-inverts it leaves gold text on gold.
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
    `<title>${heading}</title>` +
    `<style>@media (max-width:600px){.ca-outer{padding:24px 12px!important}.ca-card{padding:28px 22px 24px!important}}</style>` +
    `</head>` +
    `<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheaderOf(mail.body))}${spacer}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE}"><tr>` +
    `<td align="center" class="ca-outer" style="padding:40px 16px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:${FONT}">` +
    // The mark and the wordmark, as the site header sets them.
    `<tr><td style="padding:0 4px 20px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="vertical-align:middle;padding-right:10px"><img src="${site}/email/mark.png" width="32" height="32" alt="" style="display:block;border:0;border-radius:9px"></td>` +
    `<td style="vertical-align:middle;font-family:${FONT};font-size:17px;line-height:24px;font-weight:600;letter-spacing:-0.02em;color:${FG}">Channel <span style="color:${GOLD_TEXT}">Adda</span></td>` +
    `</tr></table></td></tr>` +
    // The card, under one gold rule: a top border, so it follows the card's
    // corners where a strip of its own would sit on them like a lid.
    `<tr><td>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CARD};border:1px solid ${BORDER};border-top:3px solid ${GOLD};border-radius:16px;border-collapse:separate">` +
    `<tr><td class="ca-card" style="padding:36px 36px 32px;font-family:${FONT}">` +
    `<h1 style="margin:0 0 20px;font-size:20px;line-height:28px;font-weight:600;letter-spacing:-0.01em;color:${FG}">${heading}</h1>` +
    paragraphs +
    code +
    button +
    `</td></tr></table>` +
    `</td></tr>` +
    // The footer: who this is from, the one warning that matters on a
    // marketplace, and where to get help.
    `<tr><td style="padding:24px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${SUBTLE}">` +
    `<p style="margin:0 0 8px"><span style="color:${MUTED};font-weight:600">Channel Adda</span> — buy and sell channels and accounts, with our agent in the middle of every deal.</p>` +
    `<p style="margin:0 0 8px">We will never ask for your password or a sign-in code, and never for a payment that is not on your deal page.</p>` +
    `<p style="margin:0"><a href="${site}/help" style="color:${SUBTLE};text-decoration:underline">Help</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${site}" style="color:${SUBTLE};text-decoration:underline">${escapeHtml(host)}</a></p>` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

/** Plain text, with the code or link on its own line so it is easy to pick out. */
export function emailText(mail: EmailContent): string {
  const parts = [mail.body.trim()];
  if (mail.code) parts.push(mail.code);
  if (mail.link) parts.push(`${mail.action ?? DEFAULT_ACTION}: ${mail.link}`);
  parts.push(`— Channel Adda\n${siteUrl()}`);
  return `${parts.join("\n\n")}\n`;
}
