import { cn } from "../../utils/cn";

export interface LinkProps {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  className?: string;
  onClick?: () => void;
}

/**
 * Minimal link wrapper.
 *
 * External links open in a new tab and carry `rel="noopener noreferrer"`; internal
 * links remain plain anchors so the dev server's client-side routing can
 * intercept them later.
 */
export function Link({
  href,
  children,
  external,
  className,
  onClick,
}: LinkProps) {
  const isExternal =
    external ?? /^https?:\/\//.test(href);

  return (
    <a
      href={href}
      {...(isExternal
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      className={cn(
        "transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded",
        className
      )}
      onClick={onClick}
    >
      {children}
    </a>
  );
}