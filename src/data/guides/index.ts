import { howToBuyAYoutubeChannel } from "./how-to-buy-a-youtube-channel";
import { howToSellAYoutubeChannel } from "./how-to-sell-a-youtube-channel";
import { isItSafeToBuyAYoutubeChannel } from "./is-it-safe-to-buy-a-youtube-channel";
import { transferYoutubeChannelOwnership } from "./transfer-youtube-channel-ownership";
import type { Guide } from "./types";
import { youtubeChannelValue } from "./youtube-channel-value";

export type { Guide } from "./types";

/** In the order the guides page lists them: buying first, as people arrive. */
export const guides: Guide[] = [
  howToBuyAYoutubeChannel,
  howToSellAYoutubeChannel,
  youtubeChannelValue,
  isItSafeToBuyAYoutubeChannel,
  transferYoutubeChannelOwnership,
];

export const guideMap: Record<string, Guide> = Object.fromEntries(
  guides.map((guide) => [guide.slug, guide]),
);
