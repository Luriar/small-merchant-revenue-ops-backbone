import type { usePreferences } from "../../hooks/usePreferences";
import type { MessageKey } from "../../i18n/messages";
import type { DemoMode } from "../../state/demoMode";
import type { LocalePreference, ThemePreference } from "../../types/preferences";

interface TopBarProps {
  demoMode?: DemoMode;
  titleKey?: MessageKey;
  preferences: ReturnType<typeof usePreferences>;
}

const themeOptions: ThemePreference[] = ["system", "light", "dark"];
const localeOptions: LocalePreference[] = ["auto", "en", "ko"];

export function TopBar({ demoMode = null, preferences, titleKey = "traceabilityOverview" }: TopBarProps) {
  const { localePreference, setLocalePreference, setThemePreference, t, themePreference } =
    preferences;
  const serviceLabel = demoMode === "m1" ? t("checkoutService") : t("paymentsService");

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Acme Corp / Production</p>
        <h1>{t(titleKey)}</h1>
      </div>
      <div className="topbar-controls" aria-label="Current scope">
        {demoMode === "m1" && <span className="demo-badge">M1 Demo</span>}
        <span className="scope-pill">{serviceLabel}</span>
        <span className="scope-pill">{t("last60Min")}</span>
        <span className="status-pill">{t("investigatingStatus")}</span>
        <label className="preference-control">
          <span>{t("theme")}</span>
          <select
            aria-label={t("theme")}
            className="preference-select"
            value={themePreference}
            onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
          >
            {themeOptions.map((option) => (
              <option key={option} value={option}>
                {option === "system" ? t("auto") : t(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="preference-control">
          <span>{t("language")}</span>
          <select
            aria-label={t("language")}
            className="preference-select"
            value={localePreference}
            onChange={(event) => setLocalePreference(event.target.value as LocalePreference)}
          >
            {localeOptions.map((option) => (
              <option key={option} value={option}>
                {option === "auto" ? t("auto") : option === "en" ? t("english") : t("korean")}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
