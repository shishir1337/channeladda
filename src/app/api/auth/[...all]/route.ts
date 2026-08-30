import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/** Every Better Auth endpoint — sign-in, sign-up, verification, reset. */
export const { GET, POST } = toNextJsHandler(auth.handler);
