export interface StreamMessage {
  type: "message" | "error";
  data: any;
}

export async function* streaming(path: string): AsyncGenerator<StreamMessage> {
  const response = await fetch(path, {
    method: "POST",
  });

  // Attach Reader
  const reader = response.body!.getReader();
  let message = "";

  while (true) {
    // wait for next encoded chunk
    const { done, value } = await reader.read();

    // check if stream is done
    if (done) {
      if (message != "\x04") {
        console.error(`Stream wrongly ended with: ${message}`);
      }

      break;
    }

    // Decodes data chunk and yields it
    message += new TextDecoder().decode(value);

    // split messaged encloded between \x02 and \x03
    let endOfCurrentMessage = message.indexOf("\x03");
    while (endOfCurrentMessage != -1) {
      // start at 1 to skip \x02
      yield JSON.parse(message.substring(1, endOfCurrentMessage));

      // +1 to skip \x03
      message = message.substring(endOfCurrentMessage + 1);

      // update chunker
      endOfCurrentMessage = message.indexOf("\x03");
    }
  }
}
