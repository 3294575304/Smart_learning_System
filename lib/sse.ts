export async function* readSseData(
  stream: ReadableStream<Uint8Array>,
  maxCharacters = 256_000,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let received = 0;
  let finished = false;
  try {
    while (!finished) {
      const chunk = await reader.read();
      finished = chunk.done;
      const decoded = decoder.decode(chunk.value, { stream: !finished });
      received += decoded.length;
      if (received > maxCharacters) throw new Error("SSE response too large");
      buffer += decoded;
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/u.exec(buffer))) {
        const event = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = event
          .split(/\r?\n/u)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /u, ""));
        if (data.length) yield data.join("\n");
      }
    }
    if (buffer.trim()) throw new Error("Incomplete SSE event");
  } finally {
    if (!finished) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
