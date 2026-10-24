import {
  BanknoteIcon,
  ChevronRightIcon,
  CoinsIcon,
  GavelIcon,
  HandshakeIcon,
  MessageSquareIcon,
  SearchIcon,
  TimerIcon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { describe, expect, it } from "vitest";
import {
  HUE_TEXT,
  HUE_TILE,
  hueOf,
  iconText,
  iconTile,
} from "@/components/ui/icon-hue";

describe("icon colours", () => {
  it("gives every money icon the same green", () => {
    expect(hueOf(WalletIcon)).toBe("green");
    expect(hueOf(CoinsIcon)).toBe("green");
    expect(hueOf(BanknoteIcon)).toBe("green");
  });

  it("keeps meanings apart: chat, offers, time and disputes differ", () => {
    const hues = [MessageSquareIcon, HandshakeIcon, TimerIcon, GavelIcon].map(
      hueOf,
    );
    expect(new Set(hues).size).toBe(4);
    expect(hueOf(GavelIcon)).toBe("red");
  });

  it("leaves controls grey", () => {
    expect(hueOf(ChevronRightIcon)).toBeNull();
    expect(hueOf(SearchIcon)).toBeNull();
    expect(iconText(XIcon)).toBe("text-subtle");
    expect(iconTile(XIcon)).toBe("border-line bg-surface-2 text-muted");
  });

  it("has a text and a tile shade for every colour, light and dark", () => {
    for (const [hue, classes] of Object.entries(HUE_TEXT)) {
      expect(classes).toContain(`text-${hue}-600`);
      expect(classes).toContain(`dark:text-${hue}-400`);
      expect(HUE_TILE[hue as keyof typeof HUE_TILE]).toContain(
        `bg-${hue}-500/10`,
      );
    }
  });
});
