import { useState } from "react";
import { Link } from "../ui/Link";
import { Button } from "../ui/Button";
import { MenuIcon, CloseIcon, CheckCircleIcon } from "../ui/Icons";
import { cn } from "../../utils/cn";

export interface NavItem {
  label: string;
  href: string;
  external?: boolean;
  active?: boolean;
  onClick?: () => void;
}

export interface AppHeaderProps {
  nav?: NavItem[];
  /** Optional readiness indicator rendered in the header. */
  readiness?: { label: string; tone: "connected" | "disconnected" | "unconfigured" };
  brand?: { title: string; subtitle?: string };
  className?: string;
}

const defaultNav: NavItem[] = [
  { label: "Search", href: "/" },
  { label: "Docs", href: "https://docs.mongodb.com/", external: true },
  {
    label: "GitHub",
    href: "https://github.com/",
    external: true,
  },
];

const readinessTones = {
  connected: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  disconnected: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  unconfigured: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

export function AppHeader({
  nav = defaultNav,
  readiness,
  brand = { title: "SmartSearch", subtitle: "Intelligent document discovery" },
  className,
}: AppHeaderProps) {
  const [open, setOpen] = useState(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-slate-200 bg-white/90 backdrop-blur",
        className
      )}
    >
      <div className="mx-auto flex h-16 max-w-content items-center gap-4 px-4 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2">
          <BrandMark />
          <span className="text-base font-semibold text-slate-900">
            {brand.title}
          </span>
          {brand.subtitle && (
            <span className="hidden text-xs text-slate-400 sm:inline">
              {brand.subtitle}
            </span>
          )}
        </Link>

        {/* Desktop nav */}
        <nav className="ml-6 hidden items-center gap-1 sm:flex" aria-label="Primary">
          {nav.map((item) => (
            <Link
              key={`${item.label}:${item.href}`}
              href={item.href}
              external={item.external}
              onClick={item.onClick}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                item.active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {readiness && (
            <span
              className={cn(
                "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:flex",
                readinessTones[readiness.tone]
              )}
            >
              <CheckCircleIcon size={12} />
              {readiness.label}
            </span>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="sm:hidden"
            aria-label="Toggle navigation"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
          </Button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {open && (
        <div className="border-t border-slate-200 sm:hidden">
          <nav className="flex flex-col gap-1 p-3" aria-label="Primary">
            {nav.map((item) => (
              <Link
                key={`${item.label}:${item.href}`}
                href={item.href}
                external={item.external}
                onClick={() => {
                  item.onClick?.();
                  setOpen(false);
                }}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  item.active
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-700 hover:bg-slate-100"
                )}
              >
                {item.label}
              </Link>
            ))}
            {readiness && (
              <span
                className={cn(
                  "mt-1 flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-medium",
                  readinessTones[readiness.tone]
                )}
              >
                <CheckCircleIcon size={12} />
                {readiness.label}
              </span>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function BrandMark() {
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </span>
  );
}