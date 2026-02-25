export function signMessageBIP322(message: string, address: string): string {
  return `bip322:${address}:${Buffer.from(message).toString("base64")}`;
}
