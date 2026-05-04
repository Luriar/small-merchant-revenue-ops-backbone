import type { MessageKey, Translator } from "../../i18n/messages";
import type { AppPage } from "../../types/navigation";

const navItems: Array<{ label: MessageKey; page: AppPage | null }> = [
  { label: "traceability", page: "traceability" },
  { label: "changes", page: "changes" },
  { label: "issues", page: "issues" },
  { label: "runs", page: "runs" },
  { label: "evidence", page: null }
];

interface SidebarProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  t: Translator;
}

export function Sidebar({ activePage, onNavigate, t }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label={`${t("traceOps")} navigation`}>
      <div className="brand">
        <span className="brand-mark">T</span>
        <span>
          <strong>{t("traceOps")}</strong>
          <small>{t("productOps")}</small>
        </span>
      </div>
      <nav className="nav-stack">
        {navItems.map((item) => (
          <a
            aria-disabled={item.page === null ? "true" : undefined}
            className={`nav-item ${item.page === activePage ? "is-active" : ""}`}
            href={`#${item.label}`}
            key={item.label}
            onClick={(event) => {
              event.preventDefault();

              if (item.page) {
                onNavigate(item.page);
              }
            }}
          >
            {t(item.label)}
          </a>
        ))}
      </nav>
      <div className="sidebar-context">
        <span>{t("workspace")}</span>
        <strong>Acme Corp</strong>
        <small>Production</small>
      </div>
    </aside>
  );
}
