// On-chain anchoring + verification — requires `ethers` (optional peer).
//
// This entrypoint is kept separate from the core so that importing
// `@mythosforge/proof` never pulls `ethers`. Everything here takes its config
// (RPC url, signer key, contract address) as EXPLICIT arguments — the package
// never reads environment variables or holds any secret.
//
// The anchor contract is permissionless emit-only: anyone may call `anchor()`,
// and the emitted `Anchor` event IS the proof. External creators who anchor to
// the shared default contract are instantly verifiable by the same tooling.

import { Contract, Interface, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes, getAddress } from 'ethers';
import {
  ANCHOR_CONTRACT_BASE_MAINNET,
  MINT_CONTRACT_BASE_MAINNET,
  ANCHOR_DEPLOY_BLOCK_BASE_MAINNET,
} from './constants.js';
import { parseTokenLineage, type RemixParents } from './lineage.js';

const HEX64 = /^[0-9a-fA-F]{64}$/;

const ANCHOR_ABI = [
  'function anchor(bytes32 manifestHash, bytes32 agentIdHash, string agentId, string agentWallet)',
  'event Anchor(bytes32 indexed manifestHash, bytes32 indexed agentIdHash, string agentId, string agentWallet)',
] as const;

const MINT_READ_ABI = [
  'function uri(uint256 tokenId) view returns (string)',
] as const;

/** Derive the `agentIdHash` event topic from an agent id, without an RPC. */
export function computeAgentIdHash(agentId: string): string {
  return keccak256(toUtf8Bytes(agentId));
}

function normalizeManifestHash(hash: string): string {
  const bare = hash.replace(/^0x/i, '').toLowerCase();
  if (!HEX64.test(bare)) throw new Error(`manifestHash must be 64 hex chars (got "${hash}")`);
  return bare;
}

// ─── Anchor (write) ────────────────────────────────────────────────────────────

export interface AnchorConfig {
  /** JSON-RPC endpoint for the target chain (mainnet by default). */
  rpcUrl: string;
  /** Private key of the signer that pays gas. Never stored or logged by this package. */
  privateKey: string;
  /** Anchor contract address. Defaults to the shared permissionless contract on Base mainnet. */
  contractAddress?: string;
}

export interface AnchorInputs {
  /** Hex SHA-256 of the canonical manifest (bare or `0x`). */
  manifestHash: string;
  /** Creator/agent identifier recorded in the event (hashed into an indexed topic). */
  agentId: string;
  /** Declared wallet string recorded in the event (may be empty). */
  agentWallet?: string;
}

export interface AnchorResult {
  txHash: string;
}

/**
 * Anchor a manifest hash by calling the permissionless `anchor()` contract.
 * Resolves once the transaction is broadcast (returns its hash); throws on
 * RPC/signing/contract errors so callers can retry.
 */
export async function anchorManifest(inputs: AnchorInputs, config: AnchorConfig): Promise<AnchorResult> {
  const manifestHash = normalizeManifestHash(inputs.manifestHash);
  const contractAddress = config.contractAddress ?? ANCHOR_CONTRACT_BASE_MAINNET;

  const provider = new JsonRpcProvider(config.rpcUrl);
  const wallet = new Wallet(config.privateKey, provider);
  const contract = new Contract(contractAddress, ANCHOR_ABI, wallet);

  const tx = await contract.getFunction('anchor')(
    '0x' + manifestHash,
    computeAgentIdHash(inputs.agentId),
    inputs.agentId,
    inputs.agentWallet ?? '',
  );
  return { txHash: tx.hash };
}

// ─── Verify anchor (read) ───────────────────────────────────────────────────────

export interface VerifyAnchorConfig {
  rpcUrl: string;
  contractAddress?: string;
  /** First block to scan for the anchor event. Defaults to the contract's deploy block. */
  fromBlock?: number;
}

export interface OnChainAnchor {
  txHash: string;
  blockNumber: number;
  /** The address that sent the anchor transaction (`tx.from`). */
  caller: string;
  agentId: string;
  agentWallet: string;
}

export interface VerifyAnchorResult {
  /** True if at least one `Anchor` event exists on-chain for this manifest hash. */
  anchored: boolean;
  /** Every matching anchor (the contract is permissionless, so there may be more than one). */
  anchors: OnChainAnchor[];
}

/**
 * Confirm on-chain that a manifest hash has been anchored. Scans the shared
 * contract's `Anchor` events filtered by the (indexed) manifest hash topic.
 * Read-only — needs only an RPC url, no signer.
 */
export async function verifyAnchorOnChain(
  manifestHash: string,
  config: VerifyAnchorConfig,
): Promise<VerifyAnchorResult> {
  const bare = normalizeManifestHash(manifestHash);
  const contractAddress = config.contractAddress ?? ANCHOR_CONTRACT_BASE_MAINNET;
  const fromBlock = config.fromBlock ?? ANCHOR_DEPLOY_BLOCK_BASE_MAINNET;

  const provider = new JsonRpcProvider(config.rpcUrl);
  const iface = new Interface(ANCHOR_ABI);
  const eventFragment = iface.getEvent('Anchor');
  if (!eventFragment) throw new Error('Anchor event missing from ABI');

  // Filter by the indexed manifest-hash topic (topic[1]) so the RPC returns
  // only this proof's anchors, keeping the scan light.
  const logs = await provider.getLogs({
    address: contractAddress,
    topics: [eventFragment.topicHash, '0x' + bare],
    fromBlock,
    toBlock: 'latest',
  });

  const anchors: OnChainAnchor[] = [];
  for (const log of logs) {
    const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    const args = parsed?.args as unknown as { agentId?: string; agentWallet?: string } | undefined;
    const tx = await provider.getTransaction(log.transactionHash);
    anchors.push({
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      caller: tx?.from ? getAddress(tx.from) : '',
      agentId: args?.agentId ?? '',
      agentWallet: args?.agentWallet ?? '',
    });
  }
  return { anchored: anchors.length > 0, anchors };
}

// ─── Read on-chain token metadata ────────────────────────────────────────────────

export interface ReadProofConfig {
  rpcUrl: string;
  /** Mint/submissions contract address. Defaults to the Base mainnet deployment. */
  mintContract?: string;
}

export interface OnChainProof {
  tokenId: string;
  /** Full decoded token metadata JSON. */
  metadata: Record<string, unknown>;
  /** Validated remix lineage if the token has `lineage.remixed_from`, else null. */
  lineage: RemixParents | null;
}

/** Parse a decimal / 0x-hex / bare 64-hex token id into a bigint, or null. */
export function parseTokenId(raw: string): bigint | null {
  const t = raw.trim();
  try {
    if (/^0x[0-9a-fA-F]+$/.test(t)) return BigInt(t);
    if (/^[0-9a-fA-F]{64}$/.test(t)) return BigInt('0x' + t);
    if (/^[0-9]+$/.test(t)) return BigInt(t);
    return null;
  } catch {
    return null;
  }
}

/**
 * Read the on-chain ERC-1155 token metadata for a minted proof and decode it.
 * Returns the full metadata plus any validated remix lineage. Read-only.
 */
export async function readOnChainProof(tokenId: bigint, config: ReadProofConfig): Promise<OnChainProof> {
  const mintContract = config.mintContract ?? MINT_CONTRACT_BASE_MAINNET;
  const provider = new JsonRpcProvider(config.rpcUrl);
  const contract = new Contract(mintContract, MINT_READ_ABI, provider);

  const uri: string = await contract.getFunction('uri')(tokenId);
  const prefix = 'data:application/json;base64,';
  if (!uri.startsWith(prefix)) {
    throw new Error('tokenURI is not a data:application/json;base64 blob');
  }
  const json = JSON.parse(Buffer.from(uri.slice(prefix.length), 'base64').toString('utf8'));
  return {
    tokenId: tokenId.toString(),
    metadata: json as Record<string, unknown>,
    lineage: parseTokenLineage(json),
  };
}

export {
  ANCHOR_CONTRACT_BASE_MAINNET,
  MINT_CONTRACT_BASE_MAINNET,
  ANCHOR_DEPLOY_BLOCK_BASE_MAINNET,
} from './constants.js';
