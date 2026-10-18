import { beforeEach, expect, test, vi } from "vitest";
import { parseChannelUrl } from "@/lib/channel-url";

// The page reader is replaced; what fetchChannelPage asks it for, and how
// it reads the answers, is real.
const reads = vi.hoisted(() => ({
  asked: [] as string[],
  answers: new Map<string, { status: number; text: string }>(),
}));

vi.mock("@/server/page-text", async (original) => ({
  ...(await original<typeof import("@/server/page-text")>()),
  readPage: async (url: string) => {
    reads.asked.push(url);
    return reads.answers.get(url) ?? { status: 404, text: "" };
  },
}));

const { fetchChannelPage, YouTubeError } = await import("@/server/youtube");

/** The least of an /about page the parser accepts. */
const PAGE = `<script>var ytInitialData = ${JSON.stringify({
  metadata: {
    channelMetadataRenderer: {
      title: "Marques Brownlee",
      externalId: "UCBJycsmduvYEL83R_U4JriQ",
    },
  },
})};</script>`;

beforeEach(() => {
  reads.asked = [];
  reads.answers.clear();
});

function parsed(link: string) {
  const result = parseChannelUrl(link);
  if (!result) throw new Error(`${link} did not parse`);
  return result;
}

test("an old /user/ name is found, not only an old /c/ one", async () => {
  // Both parse to the same "legacy" name; only one of the two paths answers
  // for a given channel, so the second is tried when the first is a 404.
  reads.answers.set("https://www.youtube.com/user/marquesbrownlee/about", {
    status: 200,
    text: PAGE,
  });

  const facts = await fetchChannelPage(
    parsed("https://www.youtube.com/user/marquesbrownlee"),
  );

  expect(facts.title).toBe("Marques Brownlee");
  expect(reads.asked).toEqual([
    "https://www.youtube.com/c/marquesbrownlee/about",
    "https://www.youtube.com/user/marquesbrownlee/about",
  ]);
});

test("a name that is on neither path is reported as not found", async () => {
  await expect(
    fetchChannelPage(parsed("https://www.youtube.com/c/nobody-at-all")),
  ).rejects.toMatchObject({ kind: "not-found" });
  expect(reads.asked).toHaveLength(2);
});

test("a handle with non-Latin letters is encoded once, not twice", async () => {
  // The link arrives already percent-encoded; encoding it again asked for
  // @caf%25C3%25A9 and got a 404 for a channel that exists.
  reads.answers.set("https://www.youtube.com/@caf%C3%A9/about", {
    status: 200,
    text: PAGE,
  });
  await fetchChannelPage(parsed("https://www.youtube.com/@café"));
  expect(reads.asked).toEqual(["https://www.youtube.com/@caf%C3%A9/about"]);
});

test("a channel id is asked for by id, and a missing one is not found", async () => {
  await expect(
    fetchChannelPage(parsed("https://www.youtube.com/channel/UC_missing")),
  ).rejects.toBeInstanceOf(YouTubeError);
  expect(reads.asked).toEqual([
    "https://www.youtube.com/channel/UC_missing/about",
  ]);
});
