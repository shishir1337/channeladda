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
 * `.mts` rather than `.ts` because this file is ESM and Vite would otherwise
 * load it as CommonJS and warn. The alternative — `"type": "module"` in
 * package.json — would change how every other .js file in the project is
 * interpreted, which is far too wide a blast radius for a test config.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
