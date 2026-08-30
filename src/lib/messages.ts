/**
 * Message limits, shared by the composer and the server that enforces them.
 *
 * This lives in `lib` rather than `server` because the textarea needs it too,
 * and `src/server/messages.ts` is `server-only` — importing that from a Client
 * Component fails the build, which is exactly what it is there for.
 */
export const MAX_MESSAGE = 4000;
