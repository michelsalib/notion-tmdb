export async function* generatorSerializer(
  generator: AsyncGenerator<any>,
): AsyncGenerator<string> {
  try {
    for await (const data of generator) {
      yield `data: ${JSON.stringify({ type: "message", data })}\n\n`;
    }
  } catch (err: any) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    yield `data: ${JSON.stringify({ type: "error", data: message })}\n\n`;
  } finally {
    yield `event: done\ndata:\n\n`;
  }
}
