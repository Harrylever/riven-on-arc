"use client"

import { useCallback, useEffect, useState } from "react"
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem"

/** Arc mainnet as wallets see it: USDC is the gas token (18 decimals natively). */
export const arcChain = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
})

export const arcPublic = createPublicClient({
  chain: arcChain,
  transport: http(),
})

declare global {
  interface Window {
    ethereum?: EIP1193Provider
  }
}

export interface TxRequest {
  to: Address
  data?: Hex
  value: string
  label: string
}

const KEY = "riven_wallet_connected"

/**
 * Non-custodial wallet connection through the browser wallet (MetaMask, Rabby,
 * Coinbase Wallet…). Riven never sees a private key: every transaction is
 * prepared here and signed in the user's wallet popup.
 */
export function useArcWallet() {
  const [address, setAddress] = useState<Address | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hasWallet = typeof window !== "undefined" && !!window.ethereum

  const refresh = useCallback(async () => {
    const eth = window.ethereum
    if (!eth) return
    const [accounts, chain] = await Promise.all([
      eth.request({ method: "eth_accounts" }) as Promise<string[]>,
      eth.request({ method: "eth_chainId" }) as Promise<string>,
    ])
    setAddress((accounts[0] as Address | undefined) ?? null)
    setChainId(parseInt(chain, 16))
  }, [])

  useEffect(() => {
    const eth = window.ethereum
    if (!eth) return
    let remembered = false
    try {
      remembered = localStorage.getItem(KEY) === "1"
    } catch {}
    if (remembered) void refresh()
    const onAccounts = (a: unknown) =>
      setAddress(((a as string[])[0] as Address | undefined) ?? null)
    const onChain = (c: unknown) => setChainId(parseInt(String(c), 16))
    eth.on?.("accountsChanged", onAccounts)
    eth.on?.("chainChanged", onChain)
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts)
      eth.removeListener?.("chainChanged", onChain)
    }
  }, [refresh])

  const ensureArc = useCallback(async () => {
    const eth = window.ethereum
    if (!eth) throw new Error("No wallet found. Install MetaMask or Rabby.")
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x13b2" }],
      })
    } catch (e) {
      // 4902 = chain not added yet.
      if ((e as { code?: number }).code !== 4902) throw e
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x13b2",
            chainName: "Arc",
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
            rpcUrls: ["https://rpc.mainnet.arc.io"],
            blockExplorerUrls: ["https://explorer.arc.io"],
          },
        ],
      })
    }
    setChainId(5042)
  }, [])

  const connect = useCallback(async () => {
    setError(null)
    const eth = window.ethereum
    if (!eth) {
      setError(
        "No browser wallet found. Install MetaMask or Rabby, then reload.",
      )
      return
    }
    try {
      const accounts = (await eth.request({
        method: "eth_requestAccounts",
      })) as string[]
      setAddress((accounts[0] as Address | undefined) ?? null)
      await ensureArc()
      try {
        localStorage.setItem(KEY, "1")
      } catch {}
    } catch (e) {
      setError((e as Error).message ?? "Wallet connection was rejected")
    }
  }, [ensureArc])

  const disconnect = useCallback(() => {
    setAddress(null)
    // drop the Ask Riven wallet session too
    void fetch("/api/arc/session", { method: "DELETE" }).catch(() => {})
    try {
      localStorage.removeItem(KEY)
    } catch {}
  }, [])

  /** Ask the wallet to sign + send one transaction, then wait until it's mined. */
  const send = useCallback(
    async (tx: TxRequest): Promise<Hex> => {
      const eth = window.ethereum
      if (!eth || !address) throw new Error("Connect a wallet first")
      assertSafeTx(tx)
      if (chainId !== 5042) await ensureArc()
      const wallet = createWalletClient({
        account: address,
        chain: arcChain,
        transport: custom(eth),
      })
      const hash = await wallet.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: BigInt(tx.value),
      })
      const receipt = await arcPublic.waitForTransactionReceipt({ hash })
      if (receipt.status !== "success")
        throw new Error(`${tx.label} failed on-chain`)
      return hash
    },
    [address, chainId, ensureArc],
  )

  return {
    hasWallet,
    address,
    chainId,
    onArc: chainId === 5042,
    error,
    connect,
    disconnect,
    ensureArc,
    send,
  }
}

// Contract calls Riven ever asks a wallet to sign: the Uniswap router, Permit2,
// and ERC-20 approve/transfer on a token. Anything else is refused, so even a
// compromised server response can't turn into an arbitrary signing request.
const KNOWN_TARGETS = new Set(
  [
    "0x4fcA4a51Ab4F23A7447b3284fBd7D73289A89Fb1", // Universal Router
    "0x000000000022D473030F116dDEE9F6B43aC78BA3", // Permit2
  ].map((a) => a.toLowerCase()),
)
const ERC20_SELECTORS = new Set(["0x095ea7b3", "0xa9059cbb"]) // approve, transfer

export function assertSafeTx(tx: { to: string; data?: string; value: string }) {
  const data = (tx.data ?? "0x").toLowerCase()
  if (data === "0x") return // plain USDC send (withdraw) — the user typed the recipient
  if (tx.value !== "0")
    throw new Error("Refusing a contract call that also sends USDC")
  if (KNOWN_TARGETS.has(tx.to.toLowerCase())) return
  if (ERC20_SELECTORS.has(data.slice(0, 10))) return
  throw new Error("Refusing to sign a call to an unknown contract")
}
