/**
 * Stands in for the `server-only` package when the test suite runs.
 *
 * `server-only`'s default export throws, which is how it stops server code
 * being pulled into a client bundle. It ships an empty module behind the
 * "react-server" export condition — the one Next uses, and the one the
 * project's scripts select with `tsx --conditions=react-server`.
 *
 * Vitest externalises node_modules, so Node resolves that package and Vite's
 * `resolve.conditions` never reach it; the package also does not export the
 * empty file as a subpath. So vitest.config.mts aliases the import here
 * instead. The tests are server-side by definition, so the marker has nothing
 * to protect.
 */
export {};
