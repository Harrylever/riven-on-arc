import { defineChain } from "viem";
import { ARC_CHAIN_ID } from "./arc-addresses.js";

// Verified against https://rpc.mainnet.arc.io with eth_chainId on 2026-10-03.
export { ARC_CHAIN_ID, EURC, MEMESPAD_FACTORY, USDC } from "./arc-addresses.js";

export const arc = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.ARC_RPC_URL ?? "https://rpc.mainnet.arc.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "Arc Explorer",
      url: "https://explorer.arc.io",
    },
  },
});
