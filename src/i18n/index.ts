import type { Language } from "../store/types";
import { en, type Messages } from "./en";
import { it } from "./it";

export type { Messages };

/** Language used when the settings don't name one (fresh installs and files from older versions). */
export const DEFAULT_LANGUAGE: Language = "it";

/** Selectable languages, each labelled in its own language. */
export const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
];

const MESSAGES: Record<Language, Messages> = { it, en };

export function isLanguage(x: unknown): x is Language {
  return typeof x === "string" && Object.hasOwn(MESSAGES, x);
}

/** The strings for `language`, falling back to the default language for unknown values. */
export function messagesFor(language: Language | undefined): Messages {
  return isLanguage(language) ? MESSAGES[language] : MESSAGES[DEFAULT_LANGUAGE];
}
