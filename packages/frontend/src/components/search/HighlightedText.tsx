export interface HighlightedTextProps {
  text: string;
  query: string;
  className?: string;
}

/**
 * Renders `text` with the portion matching `query` (case-insensitive,
 * left-anchored) wrapped in a bold mark.
 *
 * The text is inserted as text nodes, never as HTML, so no markup from the
 * backend can be interpreted. The match is left-anchored because autocomplete
 * suggestions are prefix matches.
 */
export function HighlightedText({ text, query, className }: HighlightedTextProps) {
  if (query.trim() === "") {
    return <span className={className}>{text}</span>;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return <span className={className}>{text}</span>;
  }

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <span className={className}>
      {before}
      <mark className="rounded bg-brand-100 text-brand-800 not-italic">
        {match}
      </mark>
      {after}
    </span>
  );
}