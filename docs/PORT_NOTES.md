# Arc port notes

This memo captures the current Solana-specific assumptions in the repo and what needs to be treated as chain-agnostic while porting ClawDex to Arc mainnet (chain ID `5042`).

## Solana-specific assumptions to replace

- Token address validation currently assumes a base58 Solana public key format in the frontend search flow (`BASE58_RE`). Arc uses EVM-style hex addresses (`0x...`).
- The app copy and metadata describe the product as a "Solana" launch terminal, including SEO text and manifest text.
- The stack and product documentation still talk about Helius/Solana RPC, mint/freeze authority, LP lock and bond-curve launches, which are Solana-native assumptions that need to be replaced with Arc launchpad and EVM semantics.
- The search and token route naming still uses `mint` as the canonical identifier; on Arc the canonical identifier is a token address, usually `0x...`.
- The project still includes Solana SDK packages in the frontend dependency list even though the app logic is mostly chain-agnostic and should use EVM tooling (for example `viem`) rather than Solana-specific packages.

## Chain-agnostic pieces that can stay

- The mobile-first app layout, terminal UX, scoring UI and plain-English explanation structure are not chain-specific and can remain as-is.
- The generic "score model" pattern (authority/LP lock/concentration/burns, plain-English verdicts, terminal search, and token detail pages) remains valid on Arc.
- The backend/frontend split, shared scoring utilities and API contracts can remain mostly unchanged as long as the chain adapters and address validation are converted to EVM/Arc semantics.
- The local watchlist, portfolio UX and agent prompt structure are product-level concerns and do not inherently depend on the underlying chain.

## Arc-specific requirements to implement next

- Define the Arc chain config and standard token constants in `config/arc.ts`.
- Add a scoring configuration file for Arc thresholds and hard caps so the score model is explicit and tunable.
- Use EVM address validation (`0x` + 40 hex chars) instead of Solana base58 validation.
- Update copy, metadata, and manifest strings from “Solana” to “Arc”.
- Replace Solana-specific dependencies with EVM-friendly libraries such as `viem` before deeper on-chain indexing work begins.

## Verification comments

Verified on 2026-10-03 using `https://rpc.mainnet.arc.io`: `eth_chainId` returned `0x13b2` (5042); `eth_getCode` returned 24,555 bytes for the configured Memespad factory; and the configured USDC contract returned `name=USDC`, `symbol=USDC`, `decimals=6`. A narrow `eth_getLogs` query completed successfully, while a wider request was rejected with `requested range too large`, so indexing adaptively chunks ranges rather than assuming a provider limit.

The factory's event ABI has not yet been confirmed: Sourcify full-match lookup returned 404 and the explorer's contract API returned 403 during this check. The frontend/backend therefore must not decode launch logs or label any score as verified from this factory until the event signature and indexed fields are confirmed from an authoritative source. EURC/USDC details and Uniswap v4 addresses also remain `TODO(verify)`.
