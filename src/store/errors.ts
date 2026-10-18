/** Stable identifiers for errors the UI shows to the user; the UI translates them by code. */
export type ErrorCode =
  | "invalid-json"
  | "invalid-state"
  | "missing-schema"
  | "newer-version"
  | "cannot-migrate"
  | "invalid-bookmarks"
  | "storage-full"
  | "image-unreadable"
  | "favicon-too-large"
  | "background-too-large";

/** An error with a translatable `code`; `message` stays an English, developer-facing description. */
export class StargateError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "StargateError";
    this.code = code;
  }
}
