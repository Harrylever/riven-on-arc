export const ARC_PORT_MODE = process.env.NEXT_PUBLIC_CHAIN_MODE !== "solana"
export const LEGACY_SOLANA_FEATURES_ENABLED = !ARC_PORT_MODE
/**
 * Perps terminal (Hyperliquid market data + sakz-bot signals). On by default;
 * set NEXT_PUBLIC_PERPS_ENABLED="false" to hide it.
 */
export const PERPS_ENABLED = process.env.NEXT_PUBLIC_PERPS_ENABLED !== "false"
