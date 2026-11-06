/**
 * A response body read with a byte ceiling, shared by the upstream readers
 * (lib/onchain/ord, lib/block-summary, lib/block-txs, lib/blockOgData).
 */

/**
 * Read a text body of at most `maxBytes` bytes. A declared `content-length`
 * above the limit is not read at all; otherwise the stream is read up to one
 * byte past the limit and the rest is cancelled. `null` = over the limit.
 */
export async function readCappedText(res: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(res.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
  if (!reader) {
    const text = await res.text();
    return new TextEncoder().encode(text).byteLength > maxBytes ? null : text;
  }
  // Decoded like res.text(): UTF-8, a leading BOM dropped.
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  while (size <= maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size <= maxBytes) text += decoder.decode(value, { stream: true });
  }
  if (size > maxBytes) {
    await reader.cancel().catch(() => {});
    return null;
  }
  return text + decoder.decode();
}

/** `readCappedText`, then JSON. Over the limit, or not JSON, throws `Error(what)`. */
export async function readCappedJson(res: Response, maxBytes: number, what: string): Promise<unknown> {
  const text = await readCappedText(res, maxBytes);
  if (text === null) throw new Error(`${what} over the size cap`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${what} is not JSON`);
  }
}
