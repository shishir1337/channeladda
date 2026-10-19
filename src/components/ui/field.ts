/**
 * Fields a public page draws itself.
 *
 * The kit's look — white, a hairline, a soft gold ring on focus, red when
 * `aria-invalid` — at the site's 44px, so a form on the site and one in the
 * dashboard read as the same product. The site's own fields used to be 48px,
 * grey-filled and rounder, with the error state wired by hand in each form.
 */
export const siteField =
  "block w-full rounded-[10px] border border-line bg-surface px-3.5 text-base text-fg shadow-xs transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-line-strong focus:border-primary focus:ring-[3px] focus:ring-primary/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15 sm:text-[0.9375rem] dark:bg-surface-2";

/** Single-line inputs and selects. */
export const siteInput = `${siteField} h-11`;

/** Prose. */
export const siteTextarea = `${siteField} py-2.5 leading-relaxed`;
