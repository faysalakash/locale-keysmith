import { useTranslation } from "react-i18next";

export function Edge({ count, gender, mode }: { count: number; gender: string; mode: string }) {
  const { t } = useTranslation();

  return (
    <main>
      {/* An apostrophe in JSX text must not hide the keys that follow it. */}
      <p>Don't panic</p>
      <p>{t("common:common.title")}</p>
      <p>{t("cart.item", { count })}</p>
      <p>{t("friend.greeting", { context: gender })}</p>
      <p>{t(`theme.${mode}`)}</p>
      <Nav />
    </main>
  );
}

const nav = { home: "nav.home", about: "nav.about" };

function Nav() {
  const { t } = useTranslation();

  return (
    <a href="/">
      {t(nav.home)} {t(nav.about)}
    </a>
  );
}
