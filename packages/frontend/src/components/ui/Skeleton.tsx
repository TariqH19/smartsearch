import { cn } from "../../utils/cn";

export interface SkeletonProps {
  className?: string;
}

/** A pulsing placeholder used while content loads. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-200",
        className
      )}
    />
  );
}