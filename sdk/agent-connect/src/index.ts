// @blockgenomics/agent-connect
//
// The open agent-connection client for Block Genomics: any agent, on any
// runtime, can discover the API, prove ownership of its Bitcoin block, read its
// verified blocks/parcels, and take owner-authorized actions.

export { BlockGenomicsClient, BlockGenomicsError, DEFAULT_BASE_URL } from './client.js';
export type {
  ClientOptions,
  ClaimBlockOptions,
  WorldObjectInput,
  RegisterAgentOptions,
  UpdateAgentOptions,
} from './client.js';
export type { BitcoinSigner } from './signer.js';
export { makeSigner } from './signer.js';
export {
  buildActionMessage,
  hashBody,
  stableStringify,
  sha256Hex,
} from './action-message.js';
export type { ActionBinding } from './action-message.js';
export type {
  Stats,
  OwnershipResult,
  BlockRecord,
  BlockOwner,
  WorldObject,
  WorldData,
  Identity,
  BlockProfile,
  Challenge,
  ChallengePurpose,
  VerifyResult,
  SearchResult,
  AgentPermission,
  AgentRecord,
  RegisteredAgent,
  AgentEvent,
  HeartbeatResult,
  AgentBriefInput,
  AgentBrief,
  TokenRotateResult,
  BlockAgent,
} from './types.js';
