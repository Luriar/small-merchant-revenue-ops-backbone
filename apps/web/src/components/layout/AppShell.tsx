import type { ReactNode } from "react";
import type { usePreferences } from "../../hooks/usePreferences";
import type { MessageKey } from "../../i18n/messages";
import type { DemoMode } from "../../state/demoMode";
import type { AppPage } from "../../types/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface AppShellProps {
  activePage: AppPage;
  children: ReactNode;
  demoMode?: DemoMode;
  headerTitleKey?: MessageKey;
  onNavigate: (page: AppPage) => void;
  preferences: ReturnType<typeof usePreferences>;
}

export function AppShell({
  activePage,
  children,
  demoMode = null,
  headerTitleKey,
  onNavigate,
  preferences
}: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={onNavigate} t={preferences.t} />
      <div className="app-surface">
        <TopBar demoMode={demoMode} preferences={preferences} titleKey={headerTitleKey} />
        {children}
      </div>
    </div>
  );
}
