export type Result<T> = { found: true; result: T; error?: undefined } | { found: false; result?: undefined; error: Error };
