export interface StreamMessage {
  type: "message" | "error";
  data: any;
}

export async function* streaming(path: string): AsyncGenerator<StreamMessage> {
  const response = await fetch(path, {
    method: "POST",
    headers: { accept: "text/event-stream" },
  });

  if (!response.ok || !response.body) {
    yield {
      type: "error",
      data: `Stream request failed: ${response.status}`,
    };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      let event = "message";
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith(":")) continue;
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).replace(/^ /, ""));
        }
      }

      if (event === "done") return;
      if (dataLines.length === 0) continue;

      try {
        yield JSON.parse(dataLines.join("\n"));
      } catch {
        yield { type: "error", data: "Malformed SSE message" };
      }
    }
  }
}
