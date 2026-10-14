import { LegalPage, type LegalSection } from "@/components/riven/legal"
import { buildPageMetadata } from "@/lib/site"

export const metadata = buildPageMetadata({
  title: "Disclaimer",
  description: "Riven shows evidence about Arc tokens. It is not financial advice, and a score is not a guarantee.",
  path: "/disclaimer",
})

const SECTIONS: LegalSection[] = [
  {
    id: "not-advice",
    title: "Not financial advice",
    body: (
      <>
        <p>
          Everything on Riven is information, not advice. Nothing here is a recommendation to buy, sell or hold any token, or an offer or
          solicitation of any kind. Riven is not a broker, investment adviser, exchange or custodian, and does not know your goals, finances or
          risk tolerance. Make your own decisions and do your own research (DYOR).
        </p>
        <p>
          The assistant, summaries and “Riven&apos;s read” text are generated from the data on the page. They can be wrong, incomplete or out of
          date. They never tell you what to buy or sell.
        </p>
      </>
    ),
  },
  {
    id: "scores",
    title: "A score is evidence, not a guarantee",
    body: (
      <>
        <p>
          The 1–10 score summarises on-chain facts that Riven could read about a token: its contract, its liquidity and who holds it. A high
          score does not mean a token is safe or will hold its value. A low score does not prove wrongdoing. Tokens can score well and still lose
          value, and a token Riven has not scored yet has simply not been read.
        </p>
        <ul>
          <li>Scores are measured at a point in time. Liquidity can be removed and contracts can change afterwards.</li>
          <li>Riven only scores what it can read on Arc. Off-chain activity, private agreements and future behaviour are invisible to it.</li>
          <li>
            Flags such as “flagged”, “liquidity pulled” or “creator sold out” describe evidence Riven detected. They are not accusations about
            any person or project.
          </li>
          <li>
            Riven publishes its own hit rate on the accuracy page, including weak results. Past results do not predict future ones.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "data",
    title: "Data can be late, wrong or missing",
    body: (
      <>
        <p>
          Prices, liquidity, volume, holders, ages and alerts come from Arc mainnet and from third-party sources, and may be delayed or
          inaccurate. The sync banner shows when Riven last read the chain; when it is behind, new pairs may be missing. Market caps and volumes
          can be inflated by wash trading, and some figures are estimates.
        </p>
        <p>
          Riven shows a failed read as an error, never as an “all clear”. Still, an empty list or a missing flag is not proof that nothing is
          wrong.
        </p>
      </>
    ),
  },
  {
    id: "risk",
    title: "Crypto assets are high risk",
    body: (
      <p>
        Tokens on any chain, especially newly launched ones, can lose all of their value quickly. Rug pulls, honeypots, copycat tokens, hacks,
        smart-contract bugs and thin liquidity are real risks that no tool can remove. Only risk what you can afford to lose. Check contract
        addresses against a project&apos;s official links before you act, because copies of popular tickers are common.
      </p>
    ),
  },
  {
    id: "trading",
    title: "Trading and paper trading",
    body: (
      <>
        <p>
          Riven is non-custodial. It never holds your keys or funds, and it never signs or sends a transaction for you. Where buying or selling
          is offered, the transaction is prepared for you and you review and sign it in your own wallet. You are responsible for every
          transaction you sign, including slippage, fees, failed transactions and token behaviour.
        </p>
        <p>
          The Perps section is a <b>paper-trading terminal</b>. Prices come from Hyperliquid and signals from Riven&apos;s scanner, and nothing is
          sent to an exchange. Simulated results ignore real-world slippage, liquidity and fees, and are not a prediction of real results. Scanner
          signals are opinions of a model, not advice.
        </p>
      </>
    ),
  },
  {
    id: "third-parties",
    title: "Third-party content and links",
    body: (
      <p>
        Riven shows charts, maps and data from other services (for example DexScreener, TradingView, Bubblemaps and Hyperliquid) and links to
        explorers and project websites. Riven does not control them, does not endorse them and is not responsible for their content, accuracy or
        availability. A paid boost or badge shown by a third party does not mean Riven vouches for the token.
      </p>
    ),
  },
  {
    id: "liability",
    title: "No warranty and limited liability",
    body: (
      <p>
        Riven is provided “as is” and “as available”, without warranties of any kind. To the fullest extent the law allows, Riven and the people
        behind it are not liable for any loss or damage, including lost funds or profits, arising from your use of the site, or from relying on a
        score, flag, alert, summary or signal. Nothing in this page limits liability that cannot be limited by law.
      </p>
    ),
  },
  {
    id: "eligibility",
    title: "Your responsibility",
    body: (
      <p>
        You are responsible for following the laws and tax rules that apply to you, and for deciding whether using crypto assets or any service
        is permitted where you live. Riven is not available to anyone prohibited from using it under applicable law.
      </p>
    ),
  },
]

export default function DisclaimerPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Disclaimer"
      updated="October 14, 2026"
      other={{ href: "/terms", label: "the Terms and Conditions" }}
      intro={
        <p>
          Riven reads public data on Arc and shows what it finds. It helps you look before you buy. It cannot make a token safe, and it cannot
          make a decision for you. Please read this page before relying on anything you see here.
        </p>
      }
      sections={SECTIONS}
    />
  )
}
