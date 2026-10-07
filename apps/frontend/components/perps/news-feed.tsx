"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import type { NewsItem } from "@/lib/news"
import { ago } from "@/lib/format"
import { CoinIcon } from "@/components/perps/coin-icon"

const MOOD: Record<NewsItem["sentiment"], { label: string; color: string }> = {
  bullish: { label: "Positive", color: "var(--rv-up)" },
  bearish: { label: "Negative", color: "var(--rv-down)" },
  neutral: { label: "Neutral", color: "var(--rv-ink-3)" },
}

/**
 * Trending crypto news, tagged with the pairs each story is about. News moves
 * pairs, so it's part of Riven's read on every pair page too.
 */
export function NewsFeed({ coin, limit = 12, title }: { coin?: string; limit?: number; title?: string }) {
  const [news, setNews] = useState<NewsItem[] | null>(null)
  useEffect(() => {
    let alive = true
    const load = () =>
      fetch(`/api/news?limit=${limit}${coin ? `&coin=${coin}` : ""}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { news: [] }))
        .then((j: { news: NewsItem[] }) => alive && setNews(j.news ?? []))
        .catch(() => alive && setNews([]))
    void load()
    const id = window.setInterval(load, 5 * 60_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [coin, limit])

  return (
    <section id="news" className="scroll-mt-28">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[17px] font-bold tracking-tight text-[var(--rv-ink)]">
          {title ?? (coin ? `${coin} in the news` : "Trending crypto news")}
        </h2>
        <span className="rv-live-dot" aria-hidden />
        <span className="ml-auto text-[11.5px] text-[var(--rv-ink-3)]">Cointelegraph · Decrypt · CoinDesk · Bitcoin Magazine</span>
      </div>
      {news === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rv-card h-[112px] animate-pulse" />
          ))}
        </div>
      ) : news.length === 0 ? (
        <p className="rv-card px-4 py-6 text-center text-[13px] text-[var(--rv-ink-2)]">
          {coin ? `No news about ${coin} in Riven's feeds right now.` : "News feeds are unavailable right now."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {news.map((n) => {
            const mood = MOOD[n.sentiment]
            return (
              <article key={n.id} className="rv-card flex gap-3 p-3">
                {n.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- remote news art
                  <img
                    src={n.image}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="hidden size-[76px] shrink-0 rounded-md object-cover sm:block"
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="line-clamp-2 text-[13.5px] leading-snug font-semibold text-[var(--rv-ink)] hover:underline"
                  >
                    {n.title}
                  </a>
                  <p className="text-[11px] text-[var(--rv-ink-3)]">
                    {n.source} · {ago(n.publishedAt)} ·{" "}
                    <span style={{ color: mood.color }}>{mood.label}</span>
                  </p>
                  {n.coins.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-1.5">
                      {n.coins.slice(0, 4).map((c) => (
                        <Link
                          key={c}
                          href={`/perps/${c}`}
                          className="flex items-center gap-1 rounded-full border border-[var(--rv-stroke)] bg-[var(--rv-sunken)] py-0.5 pr-2 pl-0.5 text-[11px] font-semibold text-[var(--rv-ink-2)] hover:text-[var(--rv-ink)]"
                        >
                          <CoinIcon coin={c} size={16} />
                          {c}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
