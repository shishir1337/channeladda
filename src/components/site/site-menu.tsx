"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useRef,
  useState,
} from "react";

/**
 * Whether the site's menu is open, shared between the two buttons that open
 * it: the header's, and "More" on the phone's tab bar.
 *
 * The sheet itself stays in the header. Whoever opened it gets the focus
 * back when it closes — Radix only knows about the header's own trigger.
 */
type SiteMenu = {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Opens the menu from a button that is not the header's trigger. */
  openFrom: (opener: HTMLElement) => void;
  /** For the sheet's `onCloseAutoFocus`. */
  returnFocus: (event: Event) => void;
};

const SiteMenuContext = createContext<SiteMenu | null>(null);

export function SiteMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const value: SiteMenu = {
    open,
    setOpen,
    openFrom(element) {
      opener.current = element;
      setOpen(true);
    },
    returnFocus(event) {
      const element = opener.current;
      opener.current = null;
      if (!element) return;
      event.preventDefault();
      element.focus();
    },
  };

  return <SiteMenuContext value={value}>{children}</SiteMenuContext>;
}

export function useSiteMenu(): SiteMenu {
  const menu = useContext(SiteMenuContext);
  if (!menu)
    throw new Error("useSiteMenu must be used inside SiteMenuProvider");
  return menu;
}
