import "server-only";

/**
 * Outbound email.
 *
 * There is no email provider wired up yet — that is its own item on the plan.
 * Until then this prints the message, including any link, to the server log so
 * sign-up and password reset can be exercised end to end in development.
 *
 * It refuses to run in production rather than silently dropping a password
 * reset: a swallowed email is far worse than a loud failure.
 */
export type Mail = {
  to: string;
  subject: string;
  body: string;
  /** Included in the log line so a developer can click straight through. */
  link?: string;
};

export async function sendMail(mail: Mail): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `No email provider is configured, so "${mail.subject}" could not be sent to ${mail.to}. ` +
        "Wire up a transactional email provider before deploying.",
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
}
