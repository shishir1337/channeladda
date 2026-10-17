import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { AppProviders } from "@/components/theme-provider";

afterEach(() => {
  vi.unstubAllGlobals();
});

function themeScriptTag(): string {
  const html = renderToStaticMarkup(createElement(AppProviders, null, "page"));
  const tag = html.match(/<script[^>]*>/);
  if (!tag) throw new Error("no theme script was rendered");
  return tag[0];
}

test("the theme script the server sends still runs before the first paint", () => {
  // It sets the dark or light class before anything is drawn. Without it
  // every page load flashes the wrong theme.
  expect(themeScriptTag()).not.toMatch(/\btype=/);
});

test("a theme script the browser creates is inert data, so React does not warn", () => {
  // React 19 logs "Encountered a script tag while rendering React component"
  // for any executable <script> a client component creates. Such a script
  // never runs anyway; marked as a data block it is exempt from the warning.
  vi.stubGlobal("window", {});
  expect(themeScriptTag()).toContain('type="text/plain"');
});
