"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { currencies, useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

export function CurrencySwitcher({
  className,
  fullWidth,
}: {
  className?: string;
  fullWidth?: boolean;
}) {
  const { currency, setCurrency } = useCurrency();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-muted transition-colors duration-200 hover:border-line-strong hover:bg-surface-2 hover:text-fg data-[state=open]:bg-surface-2 data-[state=open]:text-fg",
          fullWidth && "w-full justify-between px-4",
          className,
        )}
        aria-label={`Currency: ${currency.code}. Change currency`}
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="text-primary-text">
            {currency.symbol}
          </span>
          {currency.code}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 shrink-0 opacity-70"
        />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[14rem] overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-lift data-[state=closed]:animate-[fade-out_160ms_ease-in] data-[state=open]:animate-[fade-in_200ms_ease-out]"
        >
          <DropdownMenu.Label className="px-3 py-2 text-[0.6875rem] tracking-[0.12em] text-subtle uppercase">
            Display currency
          </DropdownMenu.Label>
          {currencies.map((item) => {
            const active = item.code === currency.code;
            return (
              <DropdownMenu.Item
                key={item.code}
                onSelect={() => setCurrency(item.code)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm outline-none select-none",
                  "data-[highlighted]:bg-surface-2",
                  active ? "text-fg" : "text-muted",
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-2 text-xs font-semibold text-primary-text"
                >
                  {item.symbol}
                </span>
                <span className="flex-1">
                  <span className="font-medium">{item.code}</span>
                  <span className="ml-1.5 text-xs text-subtle">
                    {item.label}
                  </span>
                </span>
                {active ? (
                  <CheckIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-primary"
                  />
                ) : null}
              </DropdownMenu.Item>
            );
          })}
          <p className="mt-1 border-t border-line px-3 pt-2.5 pb-1 text-[0.6875rem] leading-relaxed text-subtle">
            Prices are indicative. Every deal settles in crypto via Cryptomus.
          </p>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
