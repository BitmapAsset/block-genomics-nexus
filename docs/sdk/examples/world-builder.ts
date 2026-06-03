type SignedMessage = {
  ownerAddress: string;
  message: string;
  signature: string;
};

type WorldObjectInput = SignedMessage & {
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

type TerrainInput = SignedMessage & {
  blockHeight: number;
  groundColor?: string;
  fogEnabled?: boolean;
  fogColor?: string;
  skyColor?: string;
  weather?: string;
  surfaceType?: string;
};

export class BlockGenomicsWorldClient {
  constructor(private readonly baseUrl = 'https://blockgenomics.io') {}

  async verifyOwnership(blockHeight: number) {
    return this.getJson(`/api/v1/ownership/verify?blockHeight=${blockHeight}`);
  }

  async getWorld(blockHeight: number) {
    return this.getJson(`/api/v1/world?blockHeight=${blockHeight}`);
  }

  async createObject(input: WorldObjectInput) {
    return this.postJson('/api/v1/world', input);
  }

  async updateObject(objectId: string, input: Partial<WorldObjectInput> & SignedMessage) {
    return this.patchJson(`/api/v1/world/${objectId}`, input);
  }

  async deleteObject(objectId: string, input: SignedMessage) {
    return this.deleteJson(`/api/v1/world/${objectId}`, input);
  }

  async getTerrain(blockHeight: number) {
    return this.getJson(`/api/v1/world/terrain?blockHeight=${blockHeight}`);
  }

  async updateTerrain(input: TerrainInput) {
    return this.postJson('/api/v1/world/terrain', input);
  }

  private async getJson(path: string) {
    const response = await fetch(this.url(path));
    return this.read(response);
  }

  private async postJson(path: string, body: unknown) {
    const response = await fetch(this.url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.read(response);
  }

  private async patchJson(path: string, body: unknown) {
    const response = await fetch(this.url(path), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.read(response);
  }

  private async deleteJson(path: string, body: unknown) {
    const response = await fetch(this.url(path), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.read(response);
  }

  private async read(response: Response) {
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error || `Block Genomics API error: ${response.status}`);
    }
    return json;
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
    `blockHeight: ${input.blockHeight}`,
    `action: ${input.action}`,
    input.objectId ? `objectId: ${input.objectId}` : undefined,
    `nonce: ${input.nonce}`,
    `timestamp: ${input.timestamp}`,
  ].filter(Boolean).join('\n');
}
