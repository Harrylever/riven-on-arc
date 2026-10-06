import type { Metadata } from "next"
import Link from "next/link"
import { getMadeOnSolFeed } from "@/lib/kols"
import { notFound } from "next/navigation"
import { LEGACY_SOLANA_FEATURES_ENABLED } from "@/lib/flags"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "KOL Intel",
  description:
    "Recent Solana trades by tracked KOL wallets, via MadeOnSol. Buys and sells shown equally — a KOL buy is not a safety signal.",
  alternates: { canonical: "/kol" },
}

function ago(iso: string): string {
  const s = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 1000),
  )
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

export default async function KolPage() {
  if (!LEGACY_SOLANA_FEATURES_ENABLED) notFound()
  const feed = await getMadeOnSolFeed(50)

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-[var(--txt)] uppercase">
          KOL Intel
        </h1>
        <p className="mt-2 text-xs text-[var(--mut)] sm:text-sm">
          Recent trades by tracked KOL wallets. Buys and sells are shown
          equally. Data is delayed
          {feed.delay ? ` (${feed.delay})` : ""} and comes from MadeOnSol
          {feed.as_of
            ? `; as of ${new Date(feed.as_of).toLocaleTimeString()}`
            : ""}
          .
        </p>
      </div>

      {feed.trades.length === 0 ? (
        <div className="rounded-none border border-[var(--line2)] p-8 text-center text-sm text-[var(--mut)]">
          No KOL trades available right now. The feed is unreachable or not
          configured (MADEONSOL_API_KEY).
        </div>
      ) : (
        <div className="overflow-hidden rounded-none border border-[var(--line2)]">
          <table className="w-full text-xs">
            <thead className="bg-white/[0.03] text-left text-[10px] text-[var(--mut2)] uppercase">
              <tr>
                <th className="px-3 py-2">KOL</th>
                <th className="px-3 py-2">Side</th>
                <th className="px-3 py-2">Token</th>
                <th className="px-3 py-2 text-right">SOL</th>
                <th className="px-3 py-2 text-right">Mcap at trade</th>
                <th className="px-3 py-2 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {feed.trades.map((t, i) => (
                <tr
                  key={t.tx_signature ?? `${t.wallet_address}-${i}`}
                  className="border-t border-[var(--line)]"
                >
                  <td className="px-3 py-2 font-semibold">
                    {t.kol_name ??
                      `${t.wallet_address.slice(0, 4)}…${t.wallet_address.slice(-4)}`}
                  </td>
                  <td
                    className="px-3 py-2 font-bold"
                    style={{
                      color: t.action === "buy" ? "var(--green)" : "var(--red)",
                    }}
                  >
                    {t.action.toUpperCase()}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/token/${t.token_mint}`}
                      className="hover:underline"
                    >
                      {t.token_symbol ?? `${t.token_mint.slice(0, 4)}…`}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {t.sol_amount.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {t.market_cap_usd_at_trade
                      ? `$${Math.round(t.market_cap_usd_at_trade).toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--mut)]">
                    {ago(t.traded_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-[11px] text-[var(--mut2)]">
        Not financial advice. A KOL trade is not a signal to trade.
      </p>
    </div>
  )
}
