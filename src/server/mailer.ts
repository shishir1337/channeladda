import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outbound email.
 *
 * SMTP rather than one provider's SDK, because the owner has not picked a
 * provider yet and every one of them speaks SMTP: Resend, Postmark, SES,
 * Mailgun, Fastmail, a self-hosted Postfix. Switching later is four lines of
 * `.env` rather than a rewrite.
 *
 * With no `SMTP_HOST` set, mail is printed to the server log in development —
 * which is how sign-up, password reset and email verification are exercised
 * without a provider — and **throws** in production. A swallowed password
 * reset is far worse than a loud failure: the person is locked out and nobody
 * finds out until they complain.
 */
export type Mail = {
  to: string;
  subject: string;
  body: string;
  /** Included in the log line, and as a link in the HTML, so it is clickable. */
  link?: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  from: string;
};

function smtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  // 465 is TLS from the first byte; 587 and 25 start plain and upgrade with
  // STARTTLS. Getting this backwards produces a hang rather than an error,
  // which is why it is derived from the port rather than asked for.
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  return {
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
    // Falling back to the user is right for every hosted provider, where the
    // authenticated identity is the only address allowed to send.
    from: process.env.MAIL_FROM?.trim() ?? user ?? `no-reply@${host}`,
  };
}

/**
 * One transporter for the process.
 *
 * Nodemailer pools connections, and building a new one per email means a new
 * TLS handshake per email — which providers rate-limit long before they
 * rate-limit messages.
 */
const globalForMail = globalThis as unknown as { mailer?: Transporter };

function transporter(config: SmtpConfig): Transporter {
  globalForMail.mailer ??= nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    pool: true,
    maxConnections: 3,
  });
  return globalForMail.mailer;
}

/** Plain text, with the link on its own line so every client makes it clickable. */
function textBody(mail: Mail): string {
  return mail.link ? `${mail.body}\n\n${mail.link}\n` : `${mail.body}\n`;
}

/**
 * The same content as HTML.
 *
 * Deliberately plain: a transactional email that looks like a newsletter is
 * the one a spam filter holds back, and the only thing that matters here is
 * that the link is clickable.
 */
function htmlBody(mail: Mail): string {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const paragraphs = mail.body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  const link = mail.link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(mail.link)}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">Open Channel Adda</a></p>` +
      `<p style="margin:0;color:#666;font-size:13px">Or paste this into your browser:<br>${escapeHtml(mail.link)}</p>`
    : "";

  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:520px">` +
    paragraphs +
    link +
    `</div>`
  );
}

/**
 * Is there anywhere for mail to go?
 *
 * For the difference between mail somebody asked for and mail the system
 * decided to send. A password reset has to be logged in development so it
 * can be followed; a turn-taking notification on every step of every deal
 * does not, and logging one is noise that also costs a database round trip
 * to find an address nobody will read.
 */
export function canSendMail(): boolean {
  return smtpConfig() !== null;
}

export async function sendMail(mail: Mail): Promise<void> {
  const config = smtpConfig();

  if (!config) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `No email provider is configured, so "${mail.subject}" could not be sent to ${mail.to}. ` +
          "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM.",
      );
    }

    console.info(
      [
        "",
        "──────────── email (development only, not actually sent) ────────────",
        `To:      ${mail.to}`,
        `Subject: ${mail.subject}`,
        "",
        mail.body,
        mail.link ? `\n${mail.link}` : "",
        "─────────────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return;
  }

  await transporter(config).sendMail({
    from: config.from,
    to: mail.to,
    subject: mail.subject,
    text: textBody(mail),
    html: htmlBody(mail),
  });
}

/**
 * Can we actually reach the mail server?
 *
 * Used by `pnpm verify:integrations`. Opens a connection and authenticates
 * without sending anything, which is the difference between "the settings
 * parse" and "the provider will accept our mail".
 */
export async function verifyMailer(): Promise<string> {
  const config = smtpConfig();
  if (!config) throw new Error("SMTP_HOST is not set.");

  await transporter(config).verify();
  return (
    `Connected to ${config.host}:${config.port} ` +
    `(${config.secure ? "TLS" : "STARTTLS"}${config.auth ? ", authenticated" : ", no auth"}), ` +
    `sending as ${config.from}.`
  );
}
