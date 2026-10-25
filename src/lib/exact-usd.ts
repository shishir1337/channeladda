/**
 * Exact US dollars and cents from integer cents: 123456 → "$1,234.56".
 *
 * For staff desks, where a figure is checked to the cent whatever currency
 * the header is set to. The "$" every other page uses: the only dollar the
 * site shows is the US one, so "US$" said nothing the sign does not, and
 * printing both forms put the same amount on screen twice.
 */
export function exactUsd(cents: number): string {
  const formatted = (Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${cents < 0 ? "−" : ""}$${formatted}`;
}

/**
 * Why a balance correction past the largest allowed is refused, said before
 * anybody is asked to confirm it — and with no advice on getting round it.
 */
export function overMaximum(credit: boolean, maxCents: number): string {
  return `The most one correction can ${credit ? "add" : "take"} is ${exactUsd(maxCents)}.`;
}
