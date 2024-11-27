export async function* generatorSerializer(
  generator: AsyncGenerator<any>,
): AsyncGenerator<string> {
  try {
    for await (const data of generator) {
      yield "\x02";
      yield JSON.stringify({
        type: "message",
        data,
      });
      yield "\x03";
    }
  } catch (err: Error | any) {
    yield "\x02";
    if (err instanceof Error) {
      yield JSON.stringify({
        type: "error",
        data: err.message,
      });
    } else {
      yield JSON.stringify({
        type: "error",
        data: JSON.stringify(err),
      });
    }
    yield "\x03";
  } finally {
    yield "\x04";
  }
}
