// The only runtime globals core may use; Node and Apps Script both provide them.
declare const console: { log(...data: unknown[]): void; error(...data: unknown[]): void };
