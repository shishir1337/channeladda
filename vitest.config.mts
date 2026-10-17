import { fileURLToPath } from "node:url";
import "dotenv/config";
import { defineConfig } from "vitest/config";

/**
 * Tests run in plain Node, with no Next plugin.
 *
 * Everything under test is either a pure module from `src/lib` or a server
 * module talking to Postgres through Prisma — neither needs the React
 * compiler, JSX or the Next runtime. Keeping Next out of the test path means a
 * failing test is about the code and not about the framework's build.
 *
 * `resolve.tsconfigPaths` is what makes `@/` resolve here the same way it does
 * in the app, so tests import modules by the path the app uses rather than by
 * a parallel set of relative ones that drift. Vite resolves these natively
 * now; the `vite-tsconfig-paths` plugin would only duplicate it and warns as
 * much on every run.
 *
 * `dotenv/config` is imported because Vitest, unlike Next and
 * prisma.config.ts, does not read `.env` on its own — without it
 * DATABASE_URL_TEST is undefined and the harness refuses to run.
 *
 * `.mts` rather than `.ts` because this file is ESM and Vite would otherwise
 * load it as CommonJS and warn. The alternative — `"type": "module"` in
 * package.json — would change how every other .js file in the project is
 * interpreted, which is far too wide a blast radius for a test config.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // See src/test/server-only-noop.ts for why this is an alias and not a
    // resolve condition.
    alias: {
      "server-only": fileURLToPath(
        new URL("./src/test/server-only-noop.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The integration tests talk to real Postgres. Pointing DATABASE_URL at
    // the test database here — rather than in each test — means `src/lib/db`
    // builds its pool against the right database no matter which module
    // imports it first. src/test/db.ts refuses to run if this is missing.
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
      DATABASE_URL_TEST: process.env.DATABASE_URL_TEST ?? "",
    },
    // One database, shared. Parallel files would truncate each other mid-test.
    fileParallelism: false,
    // Vitest defaults to 5s, which suits a unit test. Most of these open a
    // transaction against real Postgres, and a few deliberately race two
    // writers to prove a compare-and-set holds — so the slowest of them sit
    // close enough to 5s that an unlucky run fails tests that are fine. A
    // genuine hang still fails, three times slower.
    testTimeout: 15_000,
  },
});
