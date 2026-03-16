/**
 * Block Genomics — Bitcoin Wallet Type Declarations
 * Extends the Window interface with Bitcoin wallet APIs.
 */

interface UnisatInscription {
  inscriptionId: string;
  inscriptionNumber: number;
  address: string;
  outputValue: number;
  content: string;
  contentLength: number;
  contentType: string;
  timestamp: number;
  genesisTransaction: string;
  location: string;
  output: string;
  offset: number;
}

interface UnisatWallet {
  requestAccounts(): Promise<string[]>;
  getAccounts(): Promise<string[]>;
  getNetwork(): Promise<string>;
  switchNetwork(network: string): Promise<void>;
  signMessage(message: string, type?: string): Promise<string>;
  sendBitcoin(toAddress: string, satoshis: number, options?: unknown): Promise<string>;
  signPsbt(psbtHex: string, options?: unknown): Promise<string>;
  getBalance(): Promise<{ confirmed: number; unconfirmed: number; total: number }>;
  getInscriptions(
    offset: number,
    size: number,
  ): Promise<{ total: number; list: UnisatInscription[] }>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
}

interface XverseAddress {
  address: string;
  publicKey: string;
  purpose: string;
}

interface BitcoinProvider {
  connect(): Promise<{ addresses: XverseAddress[] }>;
  signMessage(message: string, options?: { address?: string; network?: string }): Promise<string>;
  disconnect(): Promise<void>;
  // Xverse also supports request-based API
  request?(method: string, params?: unknown): Promise<unknown>;
}

interface LeatherRpcResponse {
  result?: {
    addresses?: { address: string; type: string; publicKey?: string }[];
    signature?: string;
    hex?: string;
  };
  error?: { code: number; message: string };
}

interface LeatherProvider {
  request(method: string, params?: unknown): Promise<LeatherRpcResponse>;
}

interface OkxWallet {
  bitcoin?: {
    requestAccounts(): Promise<string[]>;
    signMessage(message: string, type?: string): Promise<string>;
  };
}

interface Window {
  unisat?: UnisatWallet;
  BitcoinProvider?: BitcoinProvider;
  LeatherProvider?: LeatherProvider;
  XverseProviders?: {
    signMessage(options: { message: string; address: string }): Promise<{ signature: string }>;
  };
  okxwallet?: OkxWallet;
}
