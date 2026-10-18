import { StargateError } from "../store/errors";
import type { Language } from "../store/types";
import { DEFAULT_LANGUAGE, messagesFor, type Messages } from "./index";

let current: Language = $state(DEFAULT_LANGUAGE);

/**
 * The UI language shared by every component. App sets `language` from the document's settings;
 * components read `i18n.t`, which is reactive, so the whole UI follows a language change.
 */
export const i18n = {
  get language(): Language {
    return current;
  },
  set language(value: Language) {
    current = value;
  },
  get t(): Messages {
    return messagesFor(current);
  },
};

/** User-facing text for a caught error: translated when it carries a code, else its own message. */
export function errorText(err: unknown, fallback: string): string {
  if (err instanceof StargateError) return i18n.t.errors[err.code];
  return err instanceof Error ? err.message : fallback;
}
