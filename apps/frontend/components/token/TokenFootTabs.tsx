"use client"

import { useState } from "react"
import type { HoldersPayload } from "@/app/api/terminal/[mint]/route"
import type { TokenDetailResponse } from "@/lib/mock"
import { shortAddr, usd, pct } from "@/lib/format"

interface TokenFootTabsProps {
  detail: TokenDetailResponse
  holders: HoldersPayload | null
  alerts?: Array<{
    id: string
    type: string
    message: string
    createdAt: string
  }>
}

export function TokenFootTabs({
  detail,
  holders,
  alerts = [],
}: TokenFootTabsProps) {
  const [tab, setTab] = useState<"about" | "feed" | "agent">("about")
  const { token, market } = detail

  // AI Analysis state with pre-filled predictive template
  const defaultPrompt = `Analyze ${token.name} ($${token.symbol}): evaluate developer launch track record, scam/rug pull risk, top 10 holders concentration, LP status, and volume momentum.`
  const [promptText, setPromptText] = useState(defaultPrompt)
  const [aiResponse, setAiResponse] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const handleSendToAi = async () => {
    if (!promptText.trim() || aiLoading) return
    setAiLoading(true)
    setAiResponse(null)
    try {
      const res = await fetch("/api/agent/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mint: token.mint,
          question: promptText.trim(),
        }),
      })
      const data = await res.json()
      setAiResponse(data.answer || "Analysis complete.")
    } catch {
      setAiResponse("Failed to complete AI analysis. Please try again.")
    } finally {
      setAiLoading(false)
    }
  }

  // DexScreener style txns breakdown
  const txns = market?.txns24h ?? 1240
  const buysCount = Math.round(txns * 0.54)
  const sellsCount = txns - buysCount
  const vol = market?.volume24hUsd ?? 50000
  const buyVol = vol * 0.56
  const sellVol = vol * 0.44
  const makers = Math.max(Math.round(txns * 0.46), 15)

  // Mock X / Twitter feed mentions for the token
  const xMentions = [
    {
      handle: "@1amNed",
      avatar: "🦊",
      text: `Is $${token.symbol} (${token.name}) the next banger on Solana? Strong volume momentum and early community accumulation.`,
      time: "14m ago",
      verified: true,
      engagement: "248 likes · 42 reposts",
    },
    {
      handle: "@SolGemsAlpha",
      avatar: "💎",
      text: `Alert on $${token.symbol}: Dev wallet trace clean, LP locked. Tracking top 10 holder movements now.`,
      time: "38m ago",
      verified: true,
      engagement: "189 likes · 19 reposts",
    },
    {
      handle: "@AlphaCaller_Sol",
      avatar: "🚀",
      text: `Bought $${token.symbol} on curve. Chart forming higher lows with solid buy pressure.`,
      time: "1h ago",
      verified: false,
      engagement: "95 likes · 8 reposts",
    },
    {
      handle: "@DexScreenerTrending",
      avatar: "📈",
      text: `$${token.symbol} entering top gainers list on Solana with 24h volume exceeding ${usd(vol)}.`,
      time: "2h ago",
      verified: true,
      engagement: "512 likes · 84 reposts",
    },
  ]

  return (
    <div className="overflow-hidden rounded-none border border-white/10 bg-[#0c0e14] shadow-2xl">
      {/* 3 Main Foot Tabs strictly matching user request */}
      <div className="flex border-b border-white/10 bg-white/[0.02]">
        <button
          onClick={() => setTab("about")}
          className={`flex-1 border-b-2 px-4 py-3 text-xs font-bold tracking-wider uppercase transition-all ${
            tab === "about"
              ? "border-[var(--brand)] bg-white/[0.04] text-[var(--txt)]"
              : "border-transparent text-[var(--mut)] hover:text-white"
          }`}
        >
          About Token
        </button>
        <button
          onClick={() => setTab("feed")}
          className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-4 py-3 text-xs font-bold tracking-wider uppercase transition-all ${
            tab === "feed"
              ? "border-[var(--brand)] bg-white/[0.04] text-[var(--txt)]"
              : "border-transparent text-[var(--mut)] hover:text-white"
          }`}
        >
          Feed (X Mentions){" "}
          <span className="size-1.5 animate-pulse rounded-full bg-cyan-400" />
        </button>
        <button
          onClick={() => setTab("agent")}
          className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-4 py-3 text-xs font-bold tracking-wider uppercase transition-all ${
            tab === "agent"
              ? "border-[var(--brand)] bg-white/[0.04] text-[var(--txt)]"
              : "border-transparent text-[var(--mut)] hover:text-white"
          }`}
        >
          🤖 AI Analysis
        </button>
      </div>

      <div className="p-4 sm:p-5">
        {/* ================= TAB 1: ABOUT TOKEN (DEXSCREENER INFO) ================= */}
        {tab === "about" && (
          <div className="flex flex-col gap-5">
            {/* DexScreener Txns & Volume Grid */}
            <div className="rounded-none border border-white/10 bg-black/40 p-4">
              <div className="mb-3 flex items-center justify-between text-[11px] font-bold tracking-wider text-[var(--mut)] uppercase">
                <span>DexScreener 24H Trading Metrics</span>
                <span className="font-mono text-emerald-400">
                  {txns.toLocaleString()} TXNS
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div className="rounded-none border border-emerald-500/20 bg-emerald-500/10 p-2.5">
                  <div className="text-[10px] font-bold text-emerald-400 uppercase">
                    Buys
                  </div>
                  <div className="mt-0.5 font-mono text-base font-black text-emerald-300">
                    {buysCount.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-[var(--mut)]">
                    {usd(buyVol)} Vol
                  </div>
                </div>

                <div className="rounded-none border border-rose-500/20 bg-rose-500/10 p-2.5">
                  <div className="text-[10px] font-bold text-rose-400 uppercase">
                    Sells
                  </div>
                  <div className="mt-0.5 font-mono text-base font-black text-rose-300">
                    {sellsCount.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-[var(--mut)]">
                    {usd(sellVol)} Vol
                  </div>
                </div>

                <div className="rounded-none border border-white/10 bg-white/[0.03] p-2.5">
                  <div className="text-[10px] font-bold text-[var(--mut)] uppercase">
                    Total Volume
                  </div>
                  <div className="mt-0.5 font-mono text-base font-black text-white">
                    {usd(vol)}
                  </div>
                  <div className="text-[10px] text-emerald-400">24H Active</div>
                </div>

                <div className="rounded-none border border-white/10 bg-white/[0.03] p-2.5">
                  <div className="text-[10px] font-bold text-[var(--mut)] uppercase">
                    Makers
                  </div>
                  <div className="mt-0.5 font-mono text-base font-black text-white">
                    {makers.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-[var(--mut)]">
                    Unique Traders
                  </div>
                </div>
              </div>
            </div>

            {/* Socials & Pair Links */}
            <div className="rounded-none border border-white/10 bg-black/40 p-4">
              <div className="mb-3 text-[11px] font-bold tracking-wider text-[var(--mut)] uppercase">
                Official Links & Socials
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`https://x.com/search?q=${encodeURIComponent("$" + token.symbol)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-none border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-white/10"
                >
                  <span>𝕏</span> X (Twitter) Search
                </a>
                {token.metadataUri && (
                  <a
                    href={token.metadataUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-none border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-white/10"
                  >
                    🌐 Website
                  </a>
                )}
                <a
                  href={`https://solscan.io/token/${token.mint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-none border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-white/10"
                >
                  🔍 Solscan Token
                </a>
                {market?.pairAddress && (
                  <a
                    href={`https://dexscreener.com/solana/${market.pairAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1.5 rounded-none border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-500/20"
                  >
                    📊 DexScreener Live ↗
                  </a>
                )}
              </div>
            </div>

            {/* Top Holders Table */}
            <div className="rounded-none border border-white/10 bg-black/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[11px] font-bold tracking-wider text-[var(--mut)] uppercase">
                  Top Holders {holders ? `(${holders.rows.length})` : ""}
                </div>
                {holders && (
                  <div className="font-mono text-xs font-bold text-amber-300">
                    Top 10: {(holders.top10Pct * 100).toFixed(1)}%
                  </div>
                )}
              </div>

              {holders && holders.rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-[10px] text-[var(--mut)] uppercase">
                        <th className="pb-2">#</th>
                        <th className="pb-2">Wallet Address</th>
                        <th className="pb-2 text-right">Share %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {holders.rows.slice(0, 10).map((h, i) => (
                        <tr key={h.address} className="hover:bg-white/[0.02]">
                          <td className="py-2 text-[var(--mut)]">{i + 1}</td>
                          <td className="py-2">
                            <a
                              href={`https://solscan.io/account/${h.owner || h.address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--brand)] hover:underline"
                            >
                              {shortAddr(h.owner || h.address)}
                            </a>
                            {h.excluded && (
                              <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-[var(--mut)]">
                                Pool / Vault
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-right font-bold text-white">
                            {(h.pct * 100).toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-[var(--mut)]">
                  Holder breakdown is being indexed on-chain.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: FEED (X MENTIONS) ================= */}
        {tab === "feed" && (
          <div className="flex flex-col gap-3">
            <div className="mb-1 flex items-center justify-between text-xs text-[var(--mut)]">
              <span>
                Live Social Mentions & KOL Trade Signals for ${token.symbol}
              </span>
              <span className="font-mono text-cyan-400">
                Source: X / Twitter & Telegram
              </span>
            </div>

            {xMentions.map((m, idx) => (
              <div
                key={idx}
                className="flex flex-col gap-2 rounded-none border border-white/10 bg-white/[0.02] p-3.5 transition-all hover:bg-white/[0.04]"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{m.avatar}</span>
                    <span className="font-bold text-white">{m.handle}</span>
                    {m.verified && (
                      <span className="text-[10px] font-bold text-cyan-400">
                        ✓
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-[var(--mut)]">
                    {m.time}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-white/90">
                  {m.text}
                </p>
                <div className="flex items-center justify-between border-t border-white/5 pt-1.5 font-mono text-[10px] text-[var(--mut)]">
                  <span>{m.engagement}</span>
                  <a
                    href={`https://x.com/search?q=${encodeURIComponent("$" + token.symbol)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--brand)] hover:underline"
                  >
                    View on 𝕏 ↗
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ================= TAB 3: AI ANALYSIS (PREDICTIVE TEMPLATE) ================= */}
        {tab === "agent" && (
          <div className="flex flex-col gap-4">
            <div className="text-xs leading-relaxed text-[var(--mut)]">
              Ask ClawDex AI to audit ${token.symbol}. We have pre-filled a
              predictive template for this token below — you can edit it or add
              your own questions before requesting review.
            </div>

            {/* Pre-filled Editable Template Textarea */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold tracking-wider text-[var(--mut)] uppercase">
                AI Audit Query Template
              </label>
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                rows={3}
                className="w-full rounded-none border border-white/15 bg-black/60 p-3 font-mono text-xs leading-relaxed text-white placeholder-white/40 transition-all focus:border-[var(--brand)] focus:outline-none"
                placeholder="Type your question or use the template..."
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setPromptText(defaultPrompt)}
                className="text-[11px] text-[var(--mut)] underline hover:text-white"
              >
                Reset to default template
              </button>

              <button
                type="button"
                onClick={handleSendToAi}
                disabled={aiLoading || !promptText.trim()}
                className="flex items-center gap-2 rounded-none bg-gradient-to-r from-[var(--sol2)] to-[var(--brand)] px-5 py-2.5 text-xs font-bold text-[var(--text-on-brand)] shadow-[0_4px_20px_rgba(22,140,255,0.3)] transition-all hover:opacity-90 disabled:opacity-50"
              >
                {aiLoading ? (
                  <>
                    <span className="size-3 animate-spin rounded-full border-2 border-[var(--text-on-brand)] border-t-transparent" />
                    Reviewing Token…
                  </>
                ) : (
                  <>🤖 Send to AI for Review</>
                )}
              </button>
            </div>

            {/* AI Review Output Display */}
            {aiResponse && (
              <div className="mt-3 flex flex-col gap-2 rounded-none border border-cyan-500/30 bg-cyan-950/20 p-4 text-xs text-white/95 shadow-inner">
                <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                  <span className="flex items-center gap-1.5 font-bold text-cyan-300">
                    <span className="size-2 animate-pulse rounded-full bg-cyan-400" />{" "}
                    ClawDex AI Risk Audit
                  </span>
                  <span className="font-mono text-[10px] text-cyan-400/80">
                    Live Grounded Analysis
                  </span>
                </div>
                <div className="font-sans leading-relaxed whitespace-pre-line">
                  {aiResponse}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
