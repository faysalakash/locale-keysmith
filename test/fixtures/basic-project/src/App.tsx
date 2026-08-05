import { Trans, useTranslation } from "react-i18next";

// A "Nebula" note-taking screen, used to exercise every way a translation key
// can appear in source. Each numbered case below is picked up by the scanner
// except case 10, which is dynamic and cannot be resolved statically.

// (6) Indirect: keys stored as values in a lookup object, resolved via a variable.
const priorityKey: Record<string, string> = {
  low: "priority.low",
  medium: "priority.medium",
  high: "priority.high"
};

// (7) Indirect: keys collected in an array and mapped over.
const tagKeys = ["tag.work", "tag.personal", "tag.urgent"];

// (8) Indirect: a key held in a standalone constant.
const FOOTER_KEY = "footer.copyright";

interface AppProps {
  priority: "low" | "medium" | "high";
  online: boolean;
  mode: "dark" | "light";
}

export function App({ priority, online, mode }: AppProps) {
  const { t, i18n } = useTranslation();

  return (
    <main>
      {/* (1) Direct call in JSX text */}
      <h1>{t("app.title")}</h1>

      {/* (2) Call through the i18n instance */}
      <p>{i18n.t("app.tagline")}</p>

      {/* (3) Direct call inside a JSX attribute */}
      <button type="button" aria-label={t("app.menuLabel")}>
        ☰
      </button>

      {/* (4) <Trans> component with an i18nKey prop */}
      <Trans i18nKey="banner.welcome" />

      {/* (5) Ternary — both branch keys are literals */}
      <span>{t(online ? "status.online" : "status.offline")}</span>

      {/* (6) Indirect via lookup object */}
      <em>{t(priorityKey[priority])}</em>

      {/* (7) Indirect via an array of keys */}
      <ul>
        {tagKeys.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>

      {/* (8) Indirect via a constant */}
      <footer>{t(FOOTER_KEY)}</footer>

      {/* (9) Template literal without interpolation */}
      <small>{t(`action.save`)}</small>

      {/* (10) Dynamic template literal — the concrete key is not knowable here,
          so theme.dark / theme.light are intentionally NOT detected. */}
      <span>{t(`theme.${mode}`)}</span>
    </main>
  );
}

export default App;
