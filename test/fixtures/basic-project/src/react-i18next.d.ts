// Minimal ambient declarations so this text-only sample component type-checks in
// an editor without pulling React and react-i18next into the package. The CLI only
// ever reads these fixture files as text, so full runtime types are unnecessary.

declare module "react-i18next" {
  export type TFunction = (key: string) => string;
  export function useTranslation(): { t: TFunction; i18n: { t: TFunction } };
  export function Trans(props: { i18nKey: string }): JSX.Element;
}

declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [element: string]: Record<string, unknown>;
  }
}
