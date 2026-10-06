export const ARC_PORT_MODE = process.env.NEXT_PUBLIC_CHAIN_MODE !== "solana"
export const LEGACY_SOLANA_FEATURES_ENABLED = !ARC_PORT_MODE

/**
 * Perps terminal (Hyperliquid market data + sakz-bot signals, paper trading).
 * On by default (owner decision, 2026-10); set NEXT_PUBLIC_PERPS_ENABLED="false"
 * to hide it everywhere — nav, /perps and /api/perp-signals.
 */
export const PERPS_ENABLED = process.env.NEXT_PUBLIC_PERPS_ENABLED !== "false"

/**
 * Non-custodial buy/sell of Arc tokens (the user signs every tx in their own
 * wallet). On by default; set NEXT_PUBLIC_TRADING_ENABLED="false" to ship a
 * read-only Riven — buttons hidden and /api/arc/trade returns 404.
 */
export const TRADING_ENABLED = process.env.NEXT_PUBLIC_TRADING_ENABLED !== "false"
