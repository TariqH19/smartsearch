import { useEffect, useRef } from "react";
import { LoaderIcon } from "../ui/Icons";
import { HighlightedText } from "./HighlightedText";
import { cn } from "../../utils/cn";

export interface SuggestionDropdownProps {
  suggestions: string[];
  loading: boolean;
  error: string | null;
  query: string;
  activeIndex: number;
  isOpen: boolean;
  listId: string;
onSelect: (suggestion: string) => void;
  onHover: (index: number) => void;
  className?: string;
}

/**
 * Accessible suggestion dropdown rendered directly below the search input.
 *
 * Implements the WAI-ARIA combobox pattern: the input acts as the combobox,
 * the listbox is this dropdown. The dropdown renders nothing when closed or
 * when there are no suggestions, so an empty search never produces a blank
 * dropdown.
 */
export function SuggestionDropdown({
  suggestions,
  loading,
  error,
  query,
  activeIndex,
  isOpen,
listId,
  onSelect,
  onHover,
  className,
}: SuggestionDropdownProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the active item scrolled into view on keyboard navigation.
  useEffect(() => {
    if (!isOpen || activeIndex < 0) {
      return;
    }
    const list = listRef.current;
    if (!list) {
      return;
    }
    const item = list.children[activeIndex] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIndex, isOpen]);

  if (!isOpen) {
    return null;
  }

  if (loading) {
    return (
      <ul
        id={listId}
        role="listbox"
        aria-label="Search suggestions"
        className={cn(
          "absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg",
          className
        )}
      >
        <li className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
          <LoaderIcon size={16} className="animate-spin" />
          Finding suggestions…
        </li>
      </ul>
    );
  }

  if (error) {
    return (
      <ul
        id={listId}
        role="listbox"
        aria-label="Search suggestions"
        className={cn(
          "absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg",
          className
        )}
      >
        <li className="px-3 py-2 text-sm text-slate-500">{error}</li>
      </ul>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <ul
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label="Search suggestions"
      className={cn(
        "absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg",
        className
      )}
      onMouseDown={(e) => e.preventDefault()}
    >
      {suggestions.map((suggestion, index) => {
        const isActive = index === activeIndex;
        return (
          <li
            key={suggestion}
            id={`${listId}-option-${index}`}
            role="option"
            aria-selected={isActive}
            className={cn(
              "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
              isActive
                ? "bg-brand-50 text-brand-800"
                : "text-slate-700 hover:bg-slate-50"
            )}
            onMouseEnter={() => onHover(index)}
            onMouseDown={() => onSelect(suggestion)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 shrink-0 text-slate-400"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <HighlightedText text={suggestion} query={query} />
          </li>
        );
      })}
    </ul>
  );
}
