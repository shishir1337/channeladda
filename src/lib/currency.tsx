"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type CurrencyCode = "USD" | "USDT" | "EUR" | "GBP" | "INR" | "BDT";

export type Currency = {
  code: CurrencyCode;
  symbol: string;
  label: string;
  /** Units per 1 USD. Indicative demo rates — swap for a live feed later. */
  rate: number;
  locale: string;
  /** USDT is not an ISO 4217 code, so it is formatted by hand. */
  iso: boolean;
};

export const currencies: Currency[] = [
  {
    code: "USD",
    symbol: "$",
    label: "US Dollar",
    rate: 1,
    locale: "en-US",
    iso: true,
  },
  {
    code: "USDT",
    symbol: "₮",
    label: "Tether",
    rate: 1,
    locale: "en-US",
    iso: false,
  },
  {
    code: "EUR",
    symbol: "€",
    label: "Euro",
    rate: 0.92,
    locale: "de-DE",
    iso: true,
  },
  {
    code: "GBP",
    symbol: "£",
    label: "British Pound",
    rate: 0.79,
    locale: "en-GB",
    iso: true,
  },
  {
    code: "INR",
    symbol: "₹",
    label: "Indian Rupee",
    rate: 87.4,
    locale: "en-IN",
    iso: true,
  },
  {
    code: "BDT",
    symbol: "৳",
    label: "Bangladeshi Taka",
    rate: 121.5,
    locale: "en-BD",
    iso: true,
  },
];

const currencyMap = Object.fromEntries(
  currencies.map((c) => [c.code, c]),
) as Record<CurrencyCode, Currency>;

const STORAGE_KEY = "channeladda:currency";

type CurrencyContextValue = {
  currency: Currency;
  setCurrency: (code: CurrencyCode) => void;
  format: (usd: number, opts?: { compact?: boolean }) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  // Always starts at USD so the server and first client render agree; a saved
  // preference is applied after mount.
  const [code, setCode] = useState<CurrencyCode>("USD");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && saved in currencyMap) setCode(saved as CurrencyCode);
  }, []);

  const setCurrency = useCallback((next: CurrencyCode) => {
    setCode(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const currency = currencyMap[code];

  const format = useCallback(
    (usd: number, opts?: { compact?: boolean }) =>
      formatIn(currency, usd, opts),
    [currency],
  );

  const value = useMemo(
    () => ({ currency, setCurrency, format }),
    [currency, setCurrency, format],
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used inside CurrencyProvider");
  return ctx;
}

export function formatIn(
  currency: Currency,
  usd: number,
  opts?: { compact?: boolean },
) {
  const amount = usd * currency.rate;
  // Cents only where they say something. Every non-compact price used to be
  // whole units, so a $10 listing quoted its Safest fee as "$0" and the buyer
  // was then invoiced $0.30. A dollar amount is exact — it is what is
  // charged, or what a wallet holds — so it keeps its cents at any size:
  // "$817" against a charge of $816.80 read as a mistake. A converted amount
  // is an estimate, and stays whole once it is large: a high-rate currency
  // would show a lot of noise after the point.
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  const exact = currency.rate === 1;
  const showCents = hasCents && (exact || amount < 100);
  const maximumFractionDigits = showCents ? 2 : 0;

  const numberOpts: Intl.NumberFormatOptions = {
    maximumFractionDigits,
    minimumFractionDigits: showCents ? 2 : 0,
    ...(opts?.compact && amount >= 10_000
      ? { notation: "compact" as const, maximumFractionDigits: 1 }
      : {}),
  };

  if (currency.iso) {
    return new Intl.NumberFormat(currency.locale, {
      style: "currency",
      currency: currency.code,
      currencyDisplay: "narrowSymbol",
      ...numberOpts,
    }).format(amount);
  }

  return `${currency.symbol}${new Intl.NumberFormat(currency.locale, numberOpts).format(amount)}`;
}
