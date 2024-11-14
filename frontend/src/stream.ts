export async function* streaming(path: string) {
    const response = await fetch(path, {
      method: "POST",
    });
  
    // Attach Reader
    const reader = response.body!.getReader();
  
    while (true) {
      // wait for next encoded chunk
      const { done, value } = await reader.read();
      // check if stream is done
      if (done) break;
      // Decodes data chunk and yields it
      yield new TextDecoder().decode(value);
    }
  }