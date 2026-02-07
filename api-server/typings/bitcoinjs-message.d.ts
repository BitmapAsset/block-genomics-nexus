declare module 'bitcoinjs-message' {
  function verify(
    message: string,
    address: string,
    signature: Buffer | string,
    messagePrefix?: string | null,
    checkSegwitAlways?: boolean,
  ): boolean;

  function sign(
    message: string,
    privateKey: Buffer,
    compressed: boolean,
    messagePrefix?: string | null,
    sigOptions?: { segwitType?: 'p2sh(p2wpkh)' | 'p2wpkh'; extraEntropy?: Buffer },
  ): Buffer;

  export { verify, sign };
  export default { verify, sign };
}
