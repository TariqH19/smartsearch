import { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { cn } from "../../utils/cn";

export interface AppShellProps {
  header?: ReactNode;
  sidebar?: ReactNode;
  main: ReactNode;
  className?: string;
}

/**
 * Application shell: header + optional sidebar + main content.
 *
 * The sidebar is rendered on the left on desktop and collapses above the main
 * content on mobile, so the layout adapts without separate markup.
 */
export function AppShell({ header, sidebar, main, className }: AppShellProps) {
  return (
    <div className={cn("min-h-screen bg-slate-50 text-slate-900", className)}>
      {header ?? <AppHeader />}

      <div className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:items-start lg:gap-8">
        {sidebar && (
          <aside className="lg:sticky lg:top-20 lg:w-64">
            {sidebar}
          </aside>
        )}

        <main className="min-w-0 flex-1" id="main-content">
          {main}
        </main>
      </div>
    </div>
  );
}