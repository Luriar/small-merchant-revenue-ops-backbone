import { useEffect, useState } from "react";
import { usePreferences } from "./hooks/usePreferences";
import { ChangeTimelinePage } from "./pages/ChangeTimelinePage";
import { LinkedIssueViewPage } from "./pages/LinkedIssueViewPage";
import { ReliabilityPanelPage } from "./pages/ReliabilityPanelPage";
import { TraceabilityOverviewPage } from "./pages/TraceabilityOverviewPage";
import { RevenueCockpitApp } from "./revenue-cockpit/RevenueCockpitApp";
import type { AppPage } from "./types/navigation";

function resolvePageFromHash(hash: string): AppPage {
  const page = hash.replace(/^#/, "").toLowerCase();

  if (page === "changes") {
    return "changes";
  }

  if (page === "issues") {
    return "issues";
  }

  if (page === "runs") {
    return "runs";
  }

  if (page === "revenue-cockpit") {
    return "revenue-cockpit";
  }

  return "traceability";
}

function getInitialPage(): AppPage {
  return typeof window === "undefined" ? "traceability" : resolvePageFromHash(window.location.hash);
}

function getPageHash(page: AppPage): string {
  return page === "traceability" ? "#traceability" : `#${page}`;
}

export function App() {
  const preferences = usePreferences();
  const [activePage, setActivePage] = useState<AppPage>(getInitialPage);

  useEffect(() => {
    const syncPageFromHash = () => {
      setActivePage(resolvePageFromHash(window.location.hash));
    };

    window.addEventListener("hashchange", syncPageFromHash);
    window.addEventListener("popstate", syncPageFromHash);

    return () => {
      window.removeEventListener("hashchange", syncPageFromHash);
      window.removeEventListener("popstate", syncPageFromHash);
    };
  }, []);

  const handleNavigate = (page: AppPage) => {
    const nextUrl = new URL(window.location.href);

    nextUrl.hash = getPageHash(page);
    window.history.pushState(null, "", nextUrl);
    setActivePage(page);
  };

  if (activePage === "revenue-cockpit") {
    return <RevenueCockpitApp />;
  }

  if (activePage === "changes") {
    return (
      <ChangeTimelinePage
        activePage={activePage}
        onNavigate={handleNavigate}
        preferences={preferences}
      />
    );
  }

  if (activePage === "issues") {
    return (
      <LinkedIssueViewPage
        activePage={activePage}
        onNavigate={handleNavigate}
        preferences={preferences}
      />
    );
  }

  if (activePage === "runs") {
    return (
      <ReliabilityPanelPage
        activePage={activePage}
        onNavigate={handleNavigate}
        preferences={preferences}
      />
    );
  }

  return (
    <TraceabilityOverviewPage
      activePage={activePage}
      onNavigate={handleNavigate}
      preferences={preferences}
    />
  );
}
