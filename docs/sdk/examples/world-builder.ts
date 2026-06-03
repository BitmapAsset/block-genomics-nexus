export type SignedMessage = {
  ownerAddress: string;
  message: string;
  signature: string;
};

export type WorldObject = {
  id: string;
  blockHeight: number;
  ownerAddress: string;
  objectType: string;
  geometry?: string | null;
  color?: string | null;
  material?: string | null;
  posX?: number | null;
  posY?: number | null;
  posZ?: number | null;
  rotX?: number | null;
  rotY?: number | null;
  rotZ?: number | null;
  scaleX?: number | null;
  scaleY?: number | null;
  scaleZ?: number | null;
  name?: string | null;
  visible?: boolean | null;
  locked?: boolean | null;
};

export type Terrain = {
  blockHeight: number;
  ownerAddress: string;
  groundColor?: string | null;
  fogEnabled?: boolean | null;
  fogColor?: string | null;
  skyColor?: string | null;
  weather?: string | null;
  surfaceType?: string | null;
};

export type WorldState = {
  objects: WorldObject[];
  terrain: Terrain | null;
};

export type WorldObjectInput = SignedMessage & {
  blockHeight: number;
  objectType: string;
  name?: string;
  geometry?: string;
  color?: string;
  material?: string;
  posX?: number;
  posY?: number;
  posZ?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  visible?: boolean;
  locked?: boolean;
};

export type TerrainInput = SignedMessage & {
  blockHeight: number;
  groundColor?: string;
  fogEnabled?: boolean;
  fogColor?: string;
  skyColor?: string;
  weather?: string;
  surfaceType?: string;
};

export type WalletAdapter = {
  getAddress(): Promise<string>;
  signMessage(message: string): Promise<string>;
};

export class BlockGenomicsWorldClient {
  constructor(private readonly baseUrl = 'https://blockgenomics.io') {}

  async verifyOwnership(blockHeight: number) {
    return this.getJson('/api/v1/ownership/verify?blockHeight=' + blockHeight);
  }

  async getWorld(blockHeight: number): Promise<WorldState> {
    return this.getJson('/api/v1/world?blockHeight=' + blockHeight);
  }

  async createObject(input: WorldObjectInput): Promise<{ object: WorldObject }> {
    return this.sendJson('POST', '/api/v1/world', input);
  }

  async updateObject(
    objectId: string,
    input: Partial<Omit<WorldObjectInput, 'blockHeight' | 'objectType'>> & SignedMessage,
  ): Promise<{ object: WorldObject }> {
    return this.sendJson('PATCH', '/api/v1/world/' + encodeURIComponent(objectId), input);
  }

  async deleteObject(objectId: string, input: SignedMessage): Promise<{ success: true }> {
    return this.sendJson('DELETE', '/api/v1/world/' + encodeURIComponent(objectId), input);
  }

  async getTerrain(blockHeight: number): Promise<{ terrain: Terrain | null }> {
    return this.getJson('/api/v1/world/terrain?blockHeight=' + blockHeight);
  }

  async updateTerrain(input: TerrainInput): Promise<{ terrain: Terrain }> {
    return this.sendJson('POST', '/api/v1/world/terrain', input);
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetch(this.url(path));
    return this.read<T>(response);
  }

  private async sendJson<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body: unknown): Promise<T> {
    const response = await fetch(this.url(path), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.read<T>(response);
  }

  private async read<T>(response: Response): Promise<T> {
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error || 'Block Genomics API error: ' + response.status);
    }
    return json as T;
  }

  private url(path: string) {
    return new URL(path, this.baseUrl).toString();
  }
}

export function buildWorldMutationMessage(input: {
  blockHeight: number;
  action: 'create-object' | 'update-object' | 'delete-object' | 'update-terrain';
  objectId?: string;
  nonce: string;
  timestamp: string;
}) {
  return [
    'Block Genomics world update',
    'blockHeight: ' + input.blockHeight,
    'action: ' + input.action,
    input.objectId ? 'objectId: ' + input.objectId : undefined,
    'nonce: ' + input.nonce,
    'timestamp: ' + input.timestamp,
  ].filter(Boolean).join('\n');
}

export async function createStarterWorld(input: {
  client: BlockGenomicsWorldClient;
  wallet: WalletAdapter;
  blockHeight: number;
}) {
  const ownerAddress = await input.wallet.getAddress();
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const message = buildWorldMutationMessage({
    blockHeight: input.blockHeight,
    action: 'create-object',
    nonce,
    timestamp,
  });
  const signature = await input.wallet.signMessage(message);

  return input.client.createObject({
    blockHeight: input.blockHeight,
    ownerAddress,
    message,
    signature,
    objectType: 'monolith',
    name: 'Verified Block Anchor',
    geometry: 'box',
    color: '#f7931a',
    material: 'emissive-stone',
    posX: 0,
    posY: 2,
    posZ: 0,
    scaleX: 1,
    scaleY: 4,
    scaleZ: 1,
  });
}
