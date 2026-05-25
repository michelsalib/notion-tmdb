export interface StreamMessage {
  type: "message" | "error";
  data: any;
}

export async function* streaming(path: string): AsyncGenerator<StreamMessage> {
  const es = new EventSource(path);
  const queue: Array<StreamMessage | null> = [];
  let waker: (() => void) | null = null;

  const enqueue = (item: StreamMessage | null) => {
    queue.push(item);
    const w = waker;
    waker = null;
    w?.();
  };

  es.onmessage = (e) => {
    try {
      enqueue(JSON.parse(e.data));
    } catch {
      enqueue({ type: "error", data: "Malformed SSE message" });
    }
  };

  es.addEventListener("done", () => {
    es.close();
    enqueue(null);
  });

  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) {
      enqueue(null);
    } else {
      es.close();
      enqueue({ type: "error", data: "Connection error" });
      enqueue(null);
    }
  };

  try {
    while (true) {
      while (queue.length === 0) {
        await new Promise<void>((r) => {
          waker = r;
        });
      }
      const item = queue.shift()!;
      if (item === null) return;
      yield item;
    }
  } finally {
    es.close();
  }
}
