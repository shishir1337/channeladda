"use client";

import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { COUNTRIES } from "@/data/countries";
import { cn } from "@/lib/utils";

/**
 * A country, picked from the list: tap, type a few letters, choose — the
 * owner, 2026-10-26, for the ID check's country, so nobody types "indai"
 * and the Verified badge's citizenship is always spelled one way.
 *
 * A button that looks like the text fields beside it opens a search box
 * over the list. Letters at the start of a name come first ("in" → India
 * before Argentina), accents do not matter, and the keyboard works: arrows
 * move, Enter picks, Escape closes.
 */

const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** Starts with the query, then a word that does, then anywhere. */
function matching(query: string): readonly string[] {
  const q = fold(query);
  if (!q) return COUNTRIES;
  const starts: string[] = [];
  const words: string[] = [];
  const within: string[] = [];
  for (const name of COUNTRIES) {
    const n = fold(name);
    if (n.startsWith(q)) starts.push(name);
    else if (n.split(/[\s&.,()-]+/).some((w) => w.startsWith(q)))
      words.push(name);
    else if (n.includes(q)) within.push(name);
  }
  return [...starts, ...words, ...within];
}

const fieldClass =
  "mt-2 flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border bg-surface px-3.5 text-left text-base shadow-xs transition-[border-color,box-shadow] duration-150 focus:ring-[3px] focus:outline-none sm:text-[0.9375rem] dark:bg-surface-2 app:mt-1.5 app:px-3 app:pointer-fine:h-9 app:rounded-lg app:sm:text-sm";

export function CountrySelect({
  id,
  label,
  value,
  onChange,
  error,
  required,
  placeholder = "Choose a country",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (country: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => matching(query), [query]);

  // Opening starts from the chosen country, so the list shows where it is.
  function show() {
    setQuery("");
    setActive(Math.max(0, COUNTRIES.indexOf(value)));
    setOpen(true);
  }

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  function choose(country: string) {
    onChange(country);
    close(true);
  }

  // Focus the search when it opens; close on a press anywhere else.
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const away = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Keep the highlighted country in view as the arrows move it.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const optionId = (index: number) => `${listId}-${index}`;

  return (
    <div ref={rootRef} className="relative">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-fg app:text-[0.8125rem]"
      >
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show();
          }
        }}
        className={cn(
          fieldClass,
          error
            ? "border-danger focus:border-danger focus:ring-danger/15"
            : "border-line hover:border-line-strong focus:border-primary focus:ring-primary/20",
          open && "border-primary ring-[3px] ring-primary/20",
        )}
      >
        <span className={cn("truncate", value ? "text-fg" : "text-subtle")}>
          {value || placeholder}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface shadow-lift dark:bg-surface-2">
          <div className="relative border-b border-line p-2">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-subtle"
            />
            <input
              ref={searchRef}
              type="text"
              role="combobox"
              aria-label="Search countries"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                results.length > 0 ? optionId(active) : undefined
              }
              autoComplete="off"
              spellCheck={false}
              placeholder="Search, like India"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((i) => Math.min(results.length - 1, i + 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((i) => Math.max(0, i - 1));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const pick = results[active];
                  if (pick) choose(pick);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  close(true);
                } else if (event.key === "Tab") {
                  close(false);
                }
              }}
              // 16px on a phone, or iOS zooms in on focus.
              className="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-base text-fg placeholder:text-subtle focus:border-primary focus:ring-[3px] focus:ring-primary/20 focus:outline-none sm:text-sm dark:bg-surface-2"
            />
          </div>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="max-h-64 overflow-y-auto overscroll-contain p-1"
          >
            {results.length === 0 ? (
              <p className="px-3 py-3 text-sm text-subtle">
                No country matches “{query.trim()}”.
              </p>
            ) : (
              results.map((country, index) => {
                const selected = country === value;
                return (
                  <div
                    key={country}
                    id={optionId(index)}
                    data-index={index}
                    role="option"
                    aria-selected={selected}
                    tabIndex={-1}
                    // The search box keeps focus; a press picks on release.
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => choose(country)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        choose(country);
                      }
                    }}
                    onPointerMove={() => setActive(index)}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 text-sm text-fg pointer-fine:min-h-9",
                      index === active && "bg-surface-2 dark:bg-surface-3",
                    )}
                  >
                    <span className="truncate">{country}</span>
                    {selected ? (
                      <CheckIcon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-primary-text"
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-2 text-sm text-danger app:mt-1.5 app:text-[0.8125rem]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
