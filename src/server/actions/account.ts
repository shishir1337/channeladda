"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { PasswordFields } from "@/lib/account-security";
import {
  changePassword as changePasswordFor,
  confirmEmailChange as confirmEmailChangeFor,
  type EmailChangeResult,
  type PasswordChangeResult,
  requestEmailChange as requestEmailChangeFor,
} from "@/server/account-security";
import { requireUser } from "@/server/session";

/**
 * The security page's password and email forms.
 *
 * Thin on purpose: `@/server/account-security` holds the rules and is what
 * the tests exercise. This only makes sure somebody is signed in, hands it
 * the request, and refreshes the pages that show the email.
 */

const PAGE = "/dashboard/security";

/** Strings only: a server action can be posted to with anything at all. */
const text = (value: unknown) => (typeof value === "string" ? value : "");

export async function changePassword(
  fields: PasswordFields,
): Promise<PasswordChangeResult> {
  await requireUser(PAGE);
  return changePasswordFor(await headers(), {
    current: text(fields?.current),
    next: text(fields?.next),
    confirm: text(fields?.confirm),
  });
}

export async function requestEmailChange(fields: {
  email: string;
  password: string;
}): Promise<EmailChangeResult> {
  await requireUser(PAGE);
  const result = await requestEmailChangeFor(await headers(), {
    email: text(fields?.email),
    password: text(fields?.password),
  });
  if (result.ok && result.step === "done")
    revalidatePath("/dashboard", "layout");
  return result;
}

export async function confirmEmailChange(fields: {
  email: string;
  code: string;
}): Promise<EmailChangeResult> {
  await requireUser(PAGE);
  const result = await confirmEmailChangeFor(await headers(), {
    email: text(fields?.email),
    code: text(fields?.code),
  });
  if (result.ok) revalidatePath("/dashboard", "layout");
  return result;
}
