"use client"

import { useCallback, useSyncExternalStore } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { toast } from "@/components/ui/toast"
import { closeProceeds, marked, triggerFor } from "@/lib/paper-perps"

export interface PerpPosition {
  id: string
  market: string
  side: "LONG" | "SHORT"
  size: number
  positionValue: number
  entryPrice: number
  markPrice: number
  pnl: number
  roe: number
  liqPrice: number
  margin: number
  leverage: number
  funding: number
  tp: number | null
  tps?: number[]
  sl: number | null
  exchange: string
  openedAt: string
  /** Which paper balance funded the margin (older positions: USDC). */
  collateral?: Collateral
  /** Size when opened — each TP level closes an equal share of it. */
  initialSize?: number
  /** TP levels already taken. */
  tpsHit?: number
}

export type Collateral = "USDC" | "USDT"

export interface OpenOrder {
  id: string
  market: string
  type: "LIMIT" | "MARKET" | "SPOT"
  side: "LONG" | "SHORT" | "BUY"
  orderPrice: number
  size: number
  value: number
  tp: number | null
  tps?: number[]
  sl: number | null
  leverage?: number
  exchange: string
  collateral?: Collateral
  status: "OPEN" | "FILLED" | "CANCELLED"
  createdAt: string
}

export interface TradeRecord {
  id: string
  market: string
  type: "LIMIT" | "MARKET" | "SPOT"
  side: "LONG" | "SHORT" | "BUY"
  price: number
  size: number
  value: number
  fee: number
  pnl: number
  exchange: string
  timestamp: string
}

export interface PortfolioState {
  /** USDC paper balance (named cashBalance for older saved accounts). */
  cashBalance: number
  /** USDT paper balance. */
  usdtBalance: number
  positions: PerpPosition[]
  openOrders: OpenOrder[]
  tradeHistory: TradeRecord[]
  day14Volume: number
  totalVolume: number
}

const DEFAULT_STATE: PortfolioState = {
  cashBalance: 10000,
  usdtBalance: 10000,
  positions: [],
  openOrders: [],
  tradeHistory: [],
  day14Volume: 0,
  totalVolume: 0,
}

const ACCOUNTS_LIST_KEY = "clawdex_accounts_registry_v1"
const ACTIVE_ACCOUNT_KEY = "clawdex_active_account_v1"

export function getAccountsRegistry(): string[] {
  if (typeof window === "undefined") return ["trader_1"]

  try {
    const raw = localStorage.getItem(ACCOUNTS_LIST_KEY)
    const list = raw ? JSON.parse(raw) : null
    if (Array.isArray(list) && list.length > 0) return list
  } catch {
    // fallback
  }
  return ["trader_1"]
}

export function saveAccountsRegistry(accounts: string[]) {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(ACCOUNTS_LIST_KEY, JSON.stringify(accounts))
  } catch {
    // ignore
  }
}

export function getActiveAccountFromStorage(): string {
  if (typeof window === "undefined") return "trader_1"

  try {
    const active = localStorage.getItem(ACTIVE_ACCOUNT_KEY)
    if (active) return active
  } catch {
    // fallback
  }
  return "trader_1"
}

export function setActiveAccountInStorage(accountId: string) {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId)
    const list = getAccountsRegistry()
    if (!list.includes(accountId)) {
      saveAccountsRegistry([...list, accountId])
    }
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event("clawdex_account_change"))
}

function getStorageKey(accountId: string): string {
  // Normalize account id for storage key
  const safeId = accountId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48)
  return `clawdex_portfolio_acc_${safeId}`
}

function readStorage(accountId: string): PortfolioState {
  try {
    const key = getStorageKey(accountId)
    const raw = localStorage.getItem(key)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<PortfolioState>
    return {
      cashBalance:
        typeof parsed.cashBalance === "number" ? parsed.cashBalance : 10000,
      usdtBalance:
        typeof parsed.usdtBalance === "number" ? parsed.usdtBalance : 10000,
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
      openOrders: Array.isArray(parsed.openOrders) ? parsed.openOrders : [],
      tradeHistory: Array.isArray(parsed.tradeHistory)
        ? parsed.tradeHistory
        : [],
      day14Volume:
        typeof parsed.day14Volume === "number" ? parsed.day14Volume : 0,
      totalVolume:
        typeof parsed.totalVolume === "number" ? parsed.totalVolume : 0,
    }
  } catch {
    return DEFAULT_STATE
  }
}

const snapshotsCache = new Map<string, string>()

function writeStorage(accountId: string, state: PortfolioState) {
  const key = getStorageKey(accountId)
  try {
    const serialized = JSON.stringify(state)
    localStorage.setItem(key, serialized)
    snapshotsCache.set(key, serialized)
  } catch {
    // LocalStorage quota or privacy mode error
  }
  window.dispatchEvent(new Event(`clawdex_portfolio_change_${accountId}`))
  window.dispatchEvent(new Event("clawdex_portfolio_change"))
}

function subscribeAccount(accountId: string, callback: () => void) {
  const key = getStorageKey(accountId)
  const onChange = () => {
    snapshotsCache.delete(key)
    callback()
  }
  const eventName = `clawdex_portfolio_change_${accountId}`
  window.addEventListener(eventName, onChange)
  window.addEventListener("clawdex_account_change", onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(eventName, onChange)
    window.removeEventListener("clawdex_account_change", onChange)
    window.removeEventListener("storage", onChange)
  }
}

function getAccountSnapshot(accountId: string): string {
  const key = getStorageKey(accountId)
  let snap = snapshotsCache.get(key)
  if (snap === undefined) {
    try {
      snap = localStorage.getItem(key) ?? JSON.stringify(DEFAULT_STATE)
    } catch {
      snap = JSON.stringify(DEFAULT_STATE)
    }
    snapshotsCache.set(key, snap)
  }
  return snap
}

function balanceOf(state: PortfolioState, c: Collateral = "USDC") {
  return c === "USDT" ? state.usdtBalance : state.cashBalance
}

function adjust(state: PortfolioState, c: Collateral = "USDC", delta: number) {
  if (c === "USDT") state.usdtBalance = Math.max(0, state.usdtBalance + delta)
  else state.cashBalance = Math.max(0, state.cashBalance + delta)
}

interface NewPosition {
  market: string
  collateral?: Collateral
  type: "LIMIT" | "MARKET" | "SPOT"
  side: "LONG" | "SHORT" | "BUY"
  size: number
  price: number
  tp: number | null
  tps?: number[]
  sl: number | null
  leverage: number
  exchange: string
}

/** Charge margin + fee and record the resulting position and trade. Mutates `state`. */
function openPosition(state: PortfolioState, p: NewPosition) {
  const orderValue = p.size * p.price
  const requiredMargin =
    p.type === "SPOT" ? orderValue : orderValue / p.leverage
  const fee = orderValue * 0.00045 // 0.0450% taker fee

  adjust(state, p.collateral, -(requiredMargin + fee))
  state.day14Volume += orderValue
  state.totalVolume += orderValue

  const isLong = p.side === "LONG" || p.side === "BUY"
  const liqPrice = isLong
    ? Math.max(0, p.price * (1 - (1 / p.leverage) * 0.9))
    : p.price * (1 + (1 / p.leverage) * 0.9)

  const newPos: PerpPosition = {
    id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    market: p.market,
    side: p.side === "BUY" ? "LONG" : p.side,
    size: p.size,
    positionValue: orderValue,
    entryPrice: p.price,
    markPrice: p.price,
    pnl: 0,
    roe: 0,
    liqPrice,
    margin: requiredMargin,
    leverage: p.type === "SPOT" ? 1 : p.leverage,
    funding: 0,
    tp: p.tp,
    tps: p.tps,
    sl: p.sl,
    exchange: p.exchange,
    openedAt: new Date().toISOString(),
    collateral: p.collateral ?? "USDC",
    initialSize: p.size,
    tpsHit: 0,
  }

  const trade: TradeRecord = {
    id: `trd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    market: p.market,
    type: p.type,
    side: p.side,
    price: p.price,
    size: p.size,
    value: orderValue,
    fee,
    pnl: 0,
    exchange: p.exchange,
    timestamp: new Date().toISOString(),
  }

  state.positions = [newPos, ...state.positions]
  state.tradeHistory = [trade, ...state.tradeHistory]
}

export function usePortfolio(targetAccountId?: string) {
  const auth = useAuth()

  // Determine effective account identity:
  // 1. Explicit targetAccountId
  // 2. Verified Privy user ID or connected wallet address from auth
  // 3. Stored active local account (e.g. trader_1)
  const effectiveAccountId =
    targetAccountId ??
    (auth.authenticated && auth.userId
      ? auth.userId
      : auth.profile?.walletAddress
        ? auth.profile.walletAddress
        : typeof window !== "undefined"
          ? getActiveAccountFromStorage()
          : "trader_1")

  const raw = useSyncExternalStore(
    (cb) => subscribeAccount(effectiveAccountId, cb),
    () => getAccountSnapshot(effectiveAccountId),
    () => JSON.stringify(DEFAULT_STATE),
  )

  const state: PortfolioState = (() => {
    try {
      return JSON.parse(raw)
    } catch {
      return DEFAULT_STATE
    }
  })()

  // User-facing account label
  const accountLabel = (() => {
    if (auth.authenticated && auth.label) return auth.label
    if (auth.profile?.walletAddress) {
      const w = auth.profile.walletAddress
      return `${w.slice(0, 4)}…${w.slice(-4)}`
    }
    if (effectiveAccountId.startsWith("did:privy:")) {
      return `User #${effectiveAccountId.slice(-5)}`
    }
    if (effectiveAccountId.length > 16) {
      return `${effectiveAccountId.slice(0, 4)}…${effectiveAccountId.slice(-4)}`
    }
    return effectiveAccountId
  })()

  // Calculated portfolio metrics
  const positionMargin = state.positions.reduce((acc, p) => acc + p.margin, 0)
  const totalUnrealizedPnl = state.positions.reduce((acc, p) => acc + p.pnl, 0)
  const totalEquity =
    state.cashBalance + state.usdtBalance + positionMargin + totalUnrealizedPnl
  const tradingEquity =
    state.cashBalance + state.usdtBalance + totalUnrealizedPnl

  const placeOrder = useCallback(
    ({
      market,
      type,
      side,
      size,
      price,
      tp = null,
      tps,
      sl = null,
      leverage = 10,
      exchange = "BYBIT",
      collateral = "USDC",
    }: {
      market: string
      type: "LIMIT" | "MARKET" | "SPOT"
      side: "LONG" | "SHORT" | "BUY"
      size: number
      price: number
      tp?: number | null
      tps?: number[]
      sl?: number | null
      leverage?: number
      exchange?: string
      collateral?: Collateral
    }) => {
      const current = readStorage(effectiveAccountId)
      const orderValue = size * price
      const requiredMargin =
        type === "SPOT" ? orderValue : orderValue / leverage
      const fee = orderValue * 0.00045 // 0.0450% taker fee

      if (balanceOf(current, collateral) < requiredMargin + fee) {
        throw new Error(
          `Insufficient ${collateral} balance to place this order.`,
        )
      }

      if (type === "LIMIT") {
        const newOrder: OpenOrder = {
          id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          market,
          type,
          side,
          orderPrice: price,
          size,
          value: orderValue,
          tp,
          tps,
          sl,
          leverage,
          exchange,
          collateral,
          status: "OPEN",
          createdAt: new Date().toISOString(),
        }
        current.openOrders = [newOrder, ...current.openOrders]
      } else {
        openPosition(current, {
          market,
          type,
          side,
          size,
          price,
          tp,
          tps,
          sl,
          leverage,
          exchange,
          collateral,
        })
      }

      writeStorage(effectiveAccountId, current)

      const sideLabel = side === "BUY" ? "LONG" : side
      toast.add({
        type: "success",
        title: type === "LIMIT" ? "Limit order placed" : "Order filled",
        description: `${sideLabel} ${size} ${market} @ ${price}${
          type === "LIMIT" ? "" : ` · ${leverage}x`
        }`,
        timeout: 4000,
      })
    },
    [effectiveAccountId],
  )

  const closePosition = useCallback(
    (positionId: string) => {
      const current = readStorage(effectiveAccountId)
      const pos = current.positions.find((p) => p.id === positionId)
      if (!pos) return

      // Close at the latest mark; the closing fee really comes out of the balance.
      const { pnl, fee, returned } = closeProceeds(pos, pos.size, pos.markPrice)
      adjust(current, pos.collateral, returned)
      current.positions = current.positions.filter((p) => p.id !== positionId)

      const closingTrade: TradeRecord = {
        id: `trd_close_${Date.now()}`,
        market: pos.market,
        type: "MARKET",
        side: pos.side === "LONG" ? "SHORT" : "LONG",
        price: pos.markPrice,
        size: pos.size,
        value: pos.size * pos.markPrice,
        fee,
        pnl,
        exchange: pos.exchange,
        timestamp: new Date().toISOString(),
      }
      current.tradeHistory = [closingTrade, ...current.tradeHistory]
      writeStorage(effectiveAccountId, current)
      toast.add({
        type: pnl >= 0 ? "success" : "warning",
        title: "Position closed",
        description: `${pos.market} · PnL ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`,
        timeout: 4000,
      })
    },
    [effectiveAccountId],
  )

  /**
   * Mark every open position to the live price (by coin, e.g. { BTC: 61000 })
   * and execute whatever that triggers: liquidation, stop loss, or the next
   * take-profit level (TP1–3 each close an equal share).
   */
  const updateMarks = useCallback(
    (prices: Record<string, number>) => {
      const current = readStorage(effectiveAccountId)
      if (current.positions.length === 0) return
      let changed = false
      const kept: PerpPosition[] = []
      for (const pos of current.positions) {
        const mark = prices[pos.market.replace(/-PERP$/, "")]
        if (!mark || !Number.isFinite(mark)) {
          kept.push(pos)
          continue
        }
        let p = marked(pos, mark)
        changed ||= p.markPrice !== pos.markPrice
        const t = triggerFor(p, mark)
        if (t) {
          changed = true
          const closeSize = t.kind === "tp" ? t.closeSize : p.size
          const r =
            t.kind === "liquidated"
              ? {
                  pnl: -p.margin,
                  fee: 0,
                  returned: 0,
                  marginReleased: p.margin,
                }
              : closeProceeds(p, closeSize, t.price)
          adjust(current, p.collateral, r.returned)
          current.tradeHistory = [
            {
              id: `trd_${t.kind}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              market: p.market,
              type: "MARKET",
              side: p.side === "LONG" ? "SHORT" : "LONG",
              price: t.price,
              size: closeSize,
              value: closeSize * t.price,
              fee: r.fee,
              pnl: r.pnl,
              exchange: p.exchange,
              timestamp: new Date().toISOString(),
            },
            ...current.tradeHistory,
          ]
          const label =
            t.kind === "liquidated"
              ? "Liquidated"
              : t.kind === "sl"
                ? "Stop loss hit"
                : `TP${t.level} hit`
          toast.add({
            type:
              t.kind === "tp"
                ? "success"
                : t.kind === "sl"
                  ? "warning"
                  : "error",
            title: `${label} · ${p.market}`,
            description: `${t.kind === "tp" && closeSize < p.size ? "Closed part" : "Closed"} at ${t.price} · PnL ${r.pnl >= 0 ? "+" : ""}${r.pnl.toFixed(2)}`,
            timeout: 6000,
          })
          const left = p.size - closeSize
          if (t.kind === "tp" && left > 1e-12) {
            p = marked(
              {
                ...p,
                size: left,
                margin: p.margin - r.marginReleased,
                tpsHit: (p.tpsHit ?? 0) + 1,
              },
              mark,
            )
            kept.push(p)
          }
          continue
        }
        kept.push(p)
      }
      if (!changed) return
      current.positions = kept
      writeStorage(effectiveAccountId, current)
    },
    [effectiveAccountId],
  )

  const cancelOrder = useCallback(
    (orderId: string) => {
      const current = readStorage(effectiveAccountId)
      const order = current.openOrders.find((o) => o.id === orderId)
      if (!order) return
      current.openOrders = current.openOrders.filter((o) => o.id !== orderId)
      writeStorage(effectiveAccountId, current)
      toast.add({
        type: "info",
        title: "Order cancelled",
        description: `${order.side} ${order.size} ${order.market} @ ${order.orderPrice}`,
        timeout: 4000,
      })
    },
    [effectiveAccountId],
  )

  /**
   * Fill a resting limit order (called when price crosses it). Margin is only
   * charged now, so an account that spent it elsewhere has the order cancelled.
   */
  const fillOrder = useCallback(
    (orderId: string) => {
      const current = readStorage(effectiveAccountId)
      const order = current.openOrders.find((o) => o.id === orderId)
      if (!order) return

      current.openOrders = current.openOrders.filter((o) => o.id !== orderId)
      const leverage = order.leverage ?? 10
      const margin = order.value / leverage
      const fee = order.value * 0.00045

      if (balanceOf(current, order.collateral) < margin + fee) {
        writeStorage(effectiveAccountId, current)
        toast.add({
          type: "error",
          title: "Limit order cancelled",
          description: `${order.market} hit ${order.orderPrice} but the balance no longer covers the margin.`,
          timeout: 6000,
        })
        return
      }

      openPosition(current, {
        market: order.market,
        type: "LIMIT",
        side: order.side,
        size: order.size,
        price: order.orderPrice,
        tp: order.tp,
        tps: order.tps,
        sl: order.sl,
        leverage,
        exchange: order.exchange,
        collateral: order.collateral,
      })
      writeStorage(effectiveAccountId, current)
      toast.add({
        type: "success",
        title: "Limit order filled",
        description: `${order.side} ${order.size} ${order.market} @ ${order.orderPrice}`,
        timeout: 6000,
      })
    },
    [effectiveAccountId],
  )

  const deposit = useCallback(
    (amount: number, collateral: Collateral = "USDC") => {
      if (amount <= 0) return
      const current = readStorage(effectiveAccountId)
      adjust(current, collateral, amount)
      writeStorage(effectiveAccountId, current)
    },
    [effectiveAccountId],
  )

  const withdraw = useCallback(
    (amount: number, collateral: Collateral = "USDC") => {
      if (amount <= 0) return
      const current = readStorage(effectiveAccountId)
      if (amount > balanceOf(current, collateral)) {
        throw new Error(
          `Withdrawal amount exceeds available ${collateral} balance.`,
        )
      }
      adjust(current, collateral, -amount)
      writeStorage(effectiveAccountId, current)
    },
    [effectiveAccountId],
  )

  const resetPortfolio = useCallback(() => {
    writeStorage(effectiveAccountId, DEFAULT_STATE)
  }, [effectiveAccountId])

  const switchAccount = useCallback((newAccountId: string) => {
    setActiveAccountInStorage(newAccountId)
  }, [])

  const createAccount = useCallback((newAccountId: string) => {
    setActiveAccountInStorage(newAccountId)
  }, [])

  return {
    accountId: effectiveAccountId,
    accountLabel,
    cashBalance: state.cashBalance,
    usdtBalance: state.usdtBalance,
    positions: state.positions,
    openOrders: state.openOrders,
    tradeHistory: state.tradeHistory,
    day14Volume: state.day14Volume,
    totalVolume: state.totalVolume,
    positionMargin,
    totalUnrealizedPnl,
    totalEquity,
    tradingEquity,
    placeOrder,
    closePosition,
    updateMarks,
    cancelOrder,
    fillOrder,
    deposit,
    withdraw,
    resetPortfolio,
    switchAccount,
    createAccount,
  }
}
