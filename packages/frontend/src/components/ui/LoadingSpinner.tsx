import { LoaderIcon } from "./Icons";
import { cn } from "../../utils/cn";

export interface LoadingSpinnerProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes: Record<NonNullable<LoadingSpinnerProps["size"]>, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export function LoadingSpinner({
  label = "Loading…",
  size = "md",
  className,
}: LoadingSpinnerProps) {
  return (
    <span className="inline-flex items-center gap-2 text-slate-500">
      <LoaderIcon
        size={24}
        className={cn(sizes[size], "animate-spin", className)}
      />
      <span className="text-sm">{label}</span>
    </span>
  );
}