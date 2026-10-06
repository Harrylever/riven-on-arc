import {
  createPublicClient,
  http,
  isAddress,
  toFunctionSelector,
  type Address,
  type PublicClient,
} from "viem";
import { ARC_CHAIN_ID, arc } from "./config";

const ERC20_ABI = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const WATCHED_SELECTORS = [
  "mint(address,uint256)",
  "mint(uint256)",
  "pause()",
  "unpause()",
  "blacklist(address)",
  "addToBlacklist(address)",
  "setBlacklist(address,bool)",
  "freeze(address)",
  "setTransfersEnabled(bool)",
  "setMaxTxAmount(uint256)",
  "setTaxFee(uint256)",
  "setFee(uint256)",
] as const;

export function findWatchedSelectors(bytecode: string): string[] {
  const normalized = bytecode.toLowerCase();
  return WATCHED_SELECTORS.filter((signature) =>
    normalized.includes(toFunctionSelector(signature).slice(2).toLowerCase()),
  );
}

type ReadResult = { value: unknown } | { error: string };

export class ContractInspectorService {
  private readonly client: PublicClient;

  constructor(client?: PublicClient) {
    this.client =
      client ??
      createPublicClient({
        chain: arc,
        transport: http(
          process.env.ARC_RPC_URL ?? "https://rpc.mainnet.arc.io",
          { timeout: 15_000, retryCount: 2 },
        ),
      });
  }

  async health() {
    const [chainId, blockNumber] = await Promise.all([
      this.client.getChainId(),
      this.client.getBlockNumber(),
    ]);

    return {
      chainId,
      expectedChainId: ARC_CHAIN_ID,
      chainMatches: chainId === ARC_CHAIN_ID,
      blockNumber: blockNumber.toString(),
      explorerUrl: arc.blockExplorers.default.url,
    };
  }

  async inspect(address: string) {
    if (!isAddress(address)) throw new TypeError("Invalid EVM address");
    const chainId = await this.client.getChainId();
    if (chainId !== ARC_CHAIN_ID) {
      throw new Error(
        `Configured RPC returned chain ID ${chainId}; expected ${ARC_CHAIN_ID}`,
      );
    }
    const token = address as Address;
    const code = await this.client.getCode({ address: token });
    if (!code || code === "0x") return null;

    const [name, symbol, decimals, totalSupply, owner, implementationSlot] =
      await Promise.all([
        this.read(() =>
          this.client.readContract({
            address: token,
            abi: ERC20_ABI,
            functionName: "name",
          }),
        ),
        this.read(() =>
          this.client.readContract({
            address: token,
            abi: ERC20_ABI,
            functionName: "symbol",
          }),
        ),
        this.read(() =>
          this.client.readContract({
            address: token,
            abi: ERC20_ABI,
            functionName: "decimals",
          }),
        ),
        this.read(() =>
          this.client.readContract({
            address: token,
            abi: ERC20_ABI,
            functionName: "totalSupply",
          }),
        ),
        this.read(() =>
          this.client.readContract({
            address: token,
            abi: ERC20_ABI,
            functionName: "owner",
          }),
        ),
        this.client.getStorageAt({
          address: token,
          slot: EIP1967_IMPLEMENTATION_SLOT,
        }),
      ]);
    const ownerAddress =
      "value" in owner && typeof owner.value === "string"
        ? owner.value.toLowerCase()
        : null;
    const implementation =
      implementationSlot && implementationSlot.length >= 42
        ? `0x${implementationSlot.slice(-40)}`.toLowerCase()
        : null;

    return {
      address: token,
      chainId: ARC_CHAIN_ID,
      explorerUrl: `${arc.blockExplorers.default.url}/address/${token}`,
      metadata: {
        name: this.stringValue(name),
        symbol: this.stringValue(symbol),
        decimals: this.numberValue(decimals),
        totalSupply: this.bigintString(totalSupply),
        failures: [name, symbol, decimals, totalSupply]
          .filter((result): result is { error: string } => "error" in result)
          .map((result) => result.error),
      },
      authority: {
        owner: ownerAddress,
        ownerRenounced:
          ownerAddress === null ? null : ownerAddress === ZERO_ADDRESS,
        ownerRead: "value" in owner,
        eip1967Implementation:
          implementation === ZERO_ADDRESS ? null : implementation,
        watchedSelectors: findWatchedSelectors(code),
        limitation:
          "Bytecode selector matching is a heuristic: absent selectors do not prove a capability is absent.",
      },
    };
  }

  private async read<T>(fn: () => Promise<T>): Promise<ReadResult> {
    try {
      return { value: await fn() };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private stringValue(result: ReadResult): string | null {
    return "value" in result && typeof result.value === "string"
      ? result.value
      : null;
  }

  private numberValue(result: ReadResult): number | null {
    return "value" in result &&
      (typeof result.value === "number" || typeof result.value === "bigint")
      ? Number(result.value)
      : null;
  }

  private bigintString(result: ReadResult): string | null {
    return "value" in result &&
      (typeof result.value === "bigint" || typeof result.value === "number")
      ? String(result.value)
      : null;
  }
}
