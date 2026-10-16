import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Tests run in plain Node, with no Next plugin.
 *
 * Everything under test is either a pure module from `src/lib` or a server
 * module talking to Postgres through Prisma — neither needs the React
 * compiler, JSX or the Next runtime. Keeping Next out of the test path means a
 * failing test is about the code and not about the framework's build.
 *
 * `vite-tsconfig-paths` is what makes `@/` resolve here the same way it does
 * in the app, so tests import modules by the path the app uses rather than by
 * a parallel set of relative ones that drift.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
