import { cn } from "../../utils/cn";
import type { ReactNode } from "react";

type Tone =
  | "default"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "slate";

const tones: Record<Tone, string> = {
  default: "bg-slate-100 text-slate-600",
  brand: "bg-brand-50 text-brand-700 ring-1 ring-brand-200",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-1 ring-red-200",
  slate: "bg-slate-100 text-slate-600",
};

export interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}

export function Badge({ children, tone = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}