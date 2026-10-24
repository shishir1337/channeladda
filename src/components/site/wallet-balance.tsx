"use client";

import { WalletIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { iconText } from "@/components/ui/icon-hue";
import { Price } from "@/components/ui/price";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * The wallet balance as a quiet link to the wallet, for a header.
 *
 * Cents, in the reader's currency, and nothing louder than the controls
 * beside it: it is a figure to glance at, not a call to action.
 */
export function WalletChip({
  cents,
  className,
}: {
  cents: number;
  className?: string;
}) {
  return (
    <Link
      href="/dashboard/wallet"
      className={cn(
        "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-2",
        className,
      )}
    >
      <WalletIcon
        aria-hidden="true"
        className={`size-4 shrink-0 ${iconText(WalletIcon)}`}
      />
      <span className="sr-only">Wallet balance: </span>
      <Price usd={cents / 100} className="tabular-nums" />
    </Link>
  );
}

/**
 * The site header's balance. The header sits on static pages, so it asks
 * for the figure from the browser once somebody is signed in, again on each
 * page, and when the tab comes back into focus — a deal paid elsewhere
 * changes it.
 */
export function HeaderWallet({ className }: { className?: string }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [cents, setCents] = useState<number | null>(null);
  const signedIn = Boolean(session?.user);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger here, not a value the body reads
  useEffect(() => {
    if (!signedIn) {
      setCents(null);
      return;
    }
    let live = true;
    const load = async () => {
      try {
        const response = await fetch("/api/wallet", { cache: "no-store" });
        const body = (await response.json()) as { balanceUsd: number | null };
        if (live) setCents(body.balanceUsd);
      } catch {
        // A header figure that fails to load is left out, not an error.
      }
    };
    void load();
    window.addEventListener("focus", load);
    return () => {
      live = false;
      window.removeEventListener("focus", load);
    };
    // A new page fetches it again: a step taken there may have changed it.
  }, [signedIn, pathname]);

  if (cents === null) return null;
  return <WalletChip cents={cents} className={className} />;
}
