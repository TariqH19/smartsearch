import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { SearchIcon } from "../ui/Icons";
import { SuggestionDropdown } from "./SuggestionDropdown";
import { useSuggestions } from "./useSuggestions";
import { cn } from "../../utils/cn";

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

/**
 * Prominent search input with keyboard handling and autocomplete.
 *
 * - Enter submits the current query.
 * - Escape clears the input and closes the suggestion dropdown.
 * - Arrow keys move the active suggestion; Enter selects it and submits.
 * - The dropdown is an accessible combobox (role="combobox" + listbox).
 * - The input is auto-focused on mount so the page is immediately actionable.
 */
export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = "Search documents…",
  disabled,
  loading,
  className,
}: SearchBarProps) {
  const [local, setLocal] = useState(value);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = "search-suggestions";

  const { suggestions, loading: suggestLoading, error: suggestError, clear } =
    useSuggestions(value);

  // Sync local state with the controlled `value` prop.
  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Open the dropdown whenever suggestions exist or a request is in flight.
  useEffect(() => {
    if (suggestLoading || suggestError || suggestions.length > 0) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }, [suggestions.length, suggestLoading, suggestError]);

  // Close the dropdown when the user clicks outside the search area.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) {
        return;
      }
      setIsOpen(false);
      setActiveIndex(-1);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const submit = (text: string) => {
    const trimmed = text.trim();
    onChange(trimmed);
    onSubmit(trimmed);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const selectSuggestion = (suggestion: string) => {
    setLocal(suggestion);
    onChange(suggestion);
    setIsOpen(false);
    setActiveIndex(-1);
    submit(suggestion);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const items = suggestions;

    if (e.key === "ArrowDown") {
      if (items.length === 0) {
        return;
      }
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
      setIsOpen(true);
    } else if (e.key === "ArrowUp") {
      if (items.length === 0) {
        return;
      }
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + items.length) % items.length);
      setIsOpen(true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const activeSuggestion =
        activeIndex >= 0 && activeIndex < items.length
          ? items[activeIndex]
          : undefined;
      if (activeSuggestion) {
        selectSuggestion(activeSuggestion);
      } else {
        submit(local);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
      clear();
      inputRef.current?.focus();
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <form
        className={cn(
          "flex w-full flex-wrap items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 sm:flex-nowrap",
          disabled && "opacity-60",
          isOpen && "rounded-b-none border-b-0"
        )}
        onSubmit={(e) => {
          e.preventDefault();
          submit(local);
        }}
      >
        <SearchIcon size={20} className="shrink-0 text-slate-400" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={local}
          onChange={(e) => {
            setLocal(e.target.value);
            onChange(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Search documents"
          aria-autocomplete="list"
          aria-controls={isOpen ? listId : undefined}
          aria-expanded={isOpen}
          aria-activedescendant={
            isOpen && activeIndex >= 0
              ? `${listId}-option-${activeIndex}`
              : undefined
          }
          role="combobox"
          className="min-w-0 w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
        />
        {local && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setLocal("");
              onChange("");
              clear();
              inputRef.current?.focus();
            }}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden
            >
              <path d="m18 6-6 6m0 0 6 6m-6-6-6 6" />
            </svg>
          </button>
        )}
        <Button
          type="submit"
          size="sm"
          loading={loading}
          loadingLabel="Searching"
          disabled={disabled}
          className="shrink-0"
        >
          Search
        </Button>
      </form>

      <SuggestionDropdown
        suggestions={suggestions}
        loading={suggestLoading}
        error={suggestError}
        query={value}
        activeIndex={activeIndex}
        isOpen={isOpen}
        listId={listId}
        onSelect={selectSuggestion}
        onHover={setActiveIndex}
      />
    </div>
  );
}