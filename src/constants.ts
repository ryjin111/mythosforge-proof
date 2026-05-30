// Shared on-chain registry defaults.
//
// External creators who anchor to the SAME permissionless contract are instantly
// verifiable by the same public verifier — so these deployed mainnet addresses
// are the package defaults. Advanced users may override them (BYO contract) by
// passing an explicit address to the `./anchor` functions.

/** Base mainnet chain id. */
export const BASE_CHAIN_ID = 8453 as const;
export const BASE_CHAIN = 'base' as const;

/**
 * Permissionless emit-only anchor contract on Base mainnet. Anyone may call
 * `anchor()`; the emitted event IS the proof. Deployed and verifiable on Base.
 */
export const ANCHOR_CONTRACT_BASE_MAINNET = '0x936cc31Ce3D0e0abcD76ED29851Ab8bC5f8bEFf9' as const;

/** ERC-1155 submissions/mint contract on Base mainnet (full on-chain token metadata). */
export const MINT_CONTRACT_BASE_MAINNET = '0x21d6Ce25aa1AB3F59eE51b7693A596C6d39A03C9' as const;

/** Block the anchor contract was deployed at — a sane default `fromBlock` for log scans. */
export const ANCHOR_DEPLOY_BLOCK_BASE_MAINNET = 46221964 as const;

/** The canonicalization spec id embedded in proofs built by this package. */
export const CANONICALIZATION = 'mythosforge-manifest-v1: sorted UTF-16 keys, no whitespace, optional fields omitted when undefined';
