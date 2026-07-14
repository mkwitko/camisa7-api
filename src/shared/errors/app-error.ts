export type AppErrorDetails = Record<string, unknown>;

/**
 * Base error for every error the app throws on purpose. Never `new AppError(...)`
 * directly outside this file — throw via the catalog factory (`ERRORS.<SIGLA>.<NAME>()`)
 * in `./catalog.ts`. `message` here is the stable internal message (English,
 * technical); the user-facing localized message is resolved from `code` by the
 * error handler at response time (see `./i18n.ts`).
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: AppErrorDetails,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
