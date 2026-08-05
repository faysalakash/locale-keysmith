export type LocaleValue = string | number | boolean | null | LocaleObject | LocaleValue[];

export interface LocaleObject {
  [key: string]: LocaleValue;
}

export interface LocaleFile {
  path: string;
  locale: string;
  format: "json" | "yaml";
  data: LocaleObject;
}

export interface LocaleLintConfig {
  sourceLocale: string;
  roots: string[];
  translationFiles: string[];
  src: string[];
  ignoreKeys: string[];
}
