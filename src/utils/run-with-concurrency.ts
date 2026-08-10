export async function runWithConcurrency<Item, Result>(
  items: readonly Item[],
  requestedConcurrency: number,
  worker: (item: Item, index: number) => Promise<Result>
): Promise<Result[]> {
  if (items.length === 0) {
    return [];
  }
  const concurrency = Math.max(1, Math.min(Math.floor(requestedConcurrency), items.length));
  const results: Result[] = [];
  let nextIndex = 0;

  const runWorker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item !== undefined) {
        results[index] = await worker(item, index);
      }
    }
  };

  const workers = await Promise.allSettled(
    Array.from({ length: concurrency }, runWorker)
  );
  const failure = workers.find(
    (worker): worker is PromiseRejectedResult => worker.status === "rejected"
  );
  if (failure !== undefined) {
    throw failure.reason;
  }
  return results;
}
