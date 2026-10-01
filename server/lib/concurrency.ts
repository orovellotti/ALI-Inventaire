export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a positive integer");
  }

  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

/**
 * Keep completed work at the deadline. Abort in-flight work and never schedule
 * another item afterwards, even if a mapper ignores cancellation.
 */
export async function mapWithDeadline<T, R>(
  values: readonly T[],
  concurrency: number,
  deadline: number,
  mapper: (value: T, index: number, signal: AbortSignal) => Promise<R>,
): Promise<{ results: Map<number, R>; attempted: number; failed: number }> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a positive integer");
  }
  const results = new Map<number, R>();
  const controller = new AbortController();
  let nextIndex = 0;
  let attempted = 0;
  const timer = setTimeout(() => controller.abort(), Math.max(0, deadline - Date.now()));
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("Work deadline exceeded")), { once: true });
  });
  // No worker may start (expired deadline/empty input); still handle rejection.
  void aborted.catch(() => undefined);
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length && !controller.signal.aborted && Date.now() < deadline) {
        const index = nextIndex++;
        attempted++;
        try {
          const result = await Promise.race([mapper(values[index], index, controller.signal), aborted]);
          if (!controller.signal.aborted && Date.now() < deadline) results.set(index, result);
        } catch {
          // Individual failures remain explicit through attempted/failed counts.
        }
      }
    }));
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return { results, attempted, failed: attempted - results.size };
}