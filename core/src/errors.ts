/** An error with an HTTP status; `fields` holds per-field validation messages. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export class NotFoundError extends Error {
  status = 404;
}

/** A missing or invalid setting (e.g. no sheet ID); reported as 503 without a stack trace. */
export class ConfigError extends Error {
  status = 503;
}

/** Readable message for any error, including Google API errors. */
export function describeError(err: unknown): string {
  const e = err as { message?: string; response?: { data?: { error?: { message?: string } } } };
  return e.response?.data?.error?.message ?? e.message ?? 'Unknown error';
}
