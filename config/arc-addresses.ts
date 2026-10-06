export const ARC_CHAIN_ID = 5042;

// Verified by calling name(), symbol(), and decimals() on Arc mainnet.
export const USDC = "0x3600000000000000000000000000000000000000" as const;
// TODO(verify): confirm this is the current Arc mainnet EURC deployment.
export const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;

// Uniswap v4 PoolManager. Verified 2026-10-06: emits Initialize/ModifyLiquidity/Swap
// in Argus launch txs, and the Initialize poolId matches the Argus TokenCreated poolId.
export const UNISWAP_V4_POOL_MANAGER =
  "0x8366a39CC670B4001A1121B8F6A443A643e40951" as const;

// Argus launchpad — primary launch source. Verified 2026-10-06 via rpc.mainnet.arc.io:
// ~27 TokenCreated events in the latest ~30k blocks; each launch creates a USDC/TOKEN
// v4 pool (fee 10000, hook below) in the same tx. Signature from the Sourcify 4byte DB
// (hasVerifiedContract). Topics: [sig, token, creator]; data starts name, symbol, poolId.
export const ARGUS_FACTORY =
  "0xb021be536808f551b31789422fd28a6c9c6e97da" as const;
export const ARGUS_TOKEN_CREATED_EVENT =
  "event TokenCreated(address indexed token, address indexed creator, string name, string symbol, bytes32 poolId, string a, string b, string c, string d)" as const;
export const ARGUS_TOKEN_CREATED_TOPIC =
  "0x1d8917231579f8ce39407f0d616f36f357b07329b0ce5164d0754ac15145ce0a" as const;
// Hook on the sampled Argus pool. TODO(verify): confirm every Argus pool uses it.
export const ARGUS_V4_HOOK =
  "0x3e4039be9c353d8be7cbb2d590469691f8f3e044" as const;

// Tolly launchpad — secondary source, bonding-curve launches (the 5th field is the
// curve contract address, not a v4 poolId). Verified 2026-10-06: live, ~1 launch/4h.
export const TOLLY_FACTORY =
  "0xcad7ee36ac193bf2eddb7b3e2736c5bdb8269c8b" as const;
export const TOLLY_TOKEN_CREATED_EVENT =
  "event TokenCreated(address indexed token, address indexed creator, string name, string symbol, address curve, string a, string b, string c, string d)" as const;
export const TOLLY_TOKEN_CREATED_TOPIC =
  "0x875522b092d9e19a1de359e4bd218090d582fa521c9733889acf1a5ff1941255" as const;

// Memespad — DEPRECATED as a launch source. On 2026-10-06 this address had nonce 1
// (never deployed a contract) and emitted zero logs across sampled windows from
// block 21,250,000 to head. Keep only until Memespad confirms its real factory.
export const MEMESPAD_FACTORY =
  "0xC22dd32Bac1720e902641011D71665bF32C3ceB8" as const;
