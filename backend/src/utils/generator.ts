const HEARTBEAT_INTERVAL_MS = 25_000;

export async function* generatorSerializer(
  generator: AsyncGenerator<any>,
): AsyncGenerator<string> {
  const iter = generator[Symbol.asyncIterator]();
  let nextPromise = iter.next();

  try {
    while (true) {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const heartbeat = new Promise<"heartbeat">((resolve) => {
        timeoutId = setTimeout(
          () => resolve("heartbeat"),
          HEARTBEAT_INTERVAL_MS,
        );
      });

      const result = await Promise.race([nextPromise, heartbeat]);
      clearTimeout(timeoutId);

      if (result === "heartbeat") {
        yield `: heartbeat\n\n`;
        continue;
      }

      if (result.done) break;

      yield `data: ${JSON.stringify({ type: "message", data: result.value })}\n\n`;
      nextPromise = iter.next();
    }
  } catch (err: any) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    yield `data: ${JSON.stringify({ type: "error", data: message })}\n\n`;
  } finally {
    yield `event: done\ndata:\n\n`;
  }
}
