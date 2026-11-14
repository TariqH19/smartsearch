import { useState } from "react";
import { AppHeader } from "./components/layout/AppHeader";
import { ComparePage } from "./pages/ComparePage.js";
import { AnalyticsPage } from "./pages/AnalyticsPage.js";
import { SearchPage } from "./pages/SearchPage.js";

type View = "search" | "compare" | "analytics";

/**
 * Application root.
 *
 * Owns top-level view state and wires the shared header navigation without a
 * router dependency.
 */
export default function App() {
  const [view, setView] = useState<View>("search");
  const header = (
    <AppHeader
      nav={[
        {
          label: "Search",
          href: "#",
          active: view === "search",
          onClick: () => setView("search"),
        },
        {
          label: "Compare",
          href: "#",
          active: view === "compare",
          onClick: () => setView("compare"),
        },
        {
          label: "Analytics",
          href: "#",
          active: view === "analytics",
          onClick: () => setView("analytics"),
        },
      ]}
    />
  );

  if (view === "search") {
    return <SearchPage header={header} />;
  }
  if (view === "compare") {
    return <ComparePage header={header} />;
  }
  return <AnalyticsPage header={header} />;
}