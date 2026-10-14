import Link from "next/link"
import { LegalPage, type LegalSection } from "@/components/riven/legal"
import { buildPageMetadata } from "@/lib/site"

export const metadata = buildPageMetadata({
  title: "Terms and Conditions",
  description: "The terms for using Riven: what the service is, what you agree to, and how your data is handled.",
  path: "/terms",
})

const SECTIONS: LegalSection[] = [
  {
    id: "acceptance",
    title: "Accepting these terms",
    body: (
      <p>
        By using Riven (the website, its APIs and any alerts or bots connected to it) you agree to these Terms and Conditions and to the{" "}
        <Link href="/disclaimer" className="text-[var(--rv-ice)] hover:underline">
          Disclaimer
        </Link>
        . If you do not agree, do not use Riven. You must be old enough to enter a binding contract where you live.
      </p>
    ),
  },
  {
    id: "service",
    title: "What Riven is",
    body: (
      <>
        <p>
          Riven is an information service for tokens on Arc. It reads on-chain data, scores tokens from 1 to 10 using a published methodology,
          raises alerts about evidence such as pulled liquidity, and offers a paper-trading terminal for perpetual markets. Riven does not hold
          funds, does not offer accounts or custody, and is not an exchange, broker or adviser.
        </p>
        <p>
          Features may change, pause or disappear, and some are behind switches that are off by default (for example in-app buying and selling).
          Riven may change or discontinue the service at any time.
        </p>
      </>
    ),
  },
  {
    id: "wallets",
    title: "Wallets and transactions",
    body: (
      <ul>
        <li>You connect your own wallet. Riven never asks for, sees or stores your private keys or seed phrase. Never share them with anyone.</li>
        <li>Riven never signs or broadcasts anything for you. You review and sign every transaction yourself.</li>
        <li>Approvals Riven prepares are for the exact amount needed. Check every prompt in your wallet before you confirm.</li>
        <li>Blockchain transactions are final. Riven cannot reverse, cancel or refund them.</li>
      </ul>
    ),
  },
  {
    id: "use",
    title: "Acceptable use",
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>use Riven for anything unlawful, or to defraud, manipulate or mislead other people;</li>
          <li>scrape, overload or probe the service in ways that degrade it for others, or bypass rate limits;</li>
          <li>reverse engineer or attack the service, or try to access data you are not meant to see;</li>
          <li>present Riven scores or flags as a guarantee, or misrepresent them as advice, when sharing them.</li>
        </ul>
        <p>Riven may limit or block access to protect the service.</p>
      </>
    ),
  },
  {
    id: "content",
    title: "Scores, flags and published content",
    body: (
      <>
        <p>
          Riven describes evidence in plain terms (“flagged”, “liquidity pulled”, “creator sold out”). A flag is a statement about what the data
          showed when it was read, not a claim about anyone&apos;s intent. If you think a score or flag is wrong, for example because a token was
          rescored, tell Riven through the channel listed on its official pages and it will be looked at.
        </p>
        <p>
          Riven&apos;s name, logo, mascot, design and the compiled data and methodology are owned by Riven or its licensors. You may link to and
          quote the site, including its public embeds, with attribution. You may not copy it wholesale or imply an endorsement.
        </p>
      </>
    ),
  },
  {
    id: "privacy",
    title: "Your data and privacy",
    body: (
      <>
        <p>Riven is built to need as little personal data as possible:</p>
        <ul>
          <li>
            <b>No accounts.</b> There is no sign-up. Your watchlist, preferences and session choices are kept in your browser&apos;s local storage
            on your device.
          </li>
          <li>
            <b>Wallet addresses are public.</b> When you connect a wallet or paste an address, Riven reads public on-chain data for it. Anyone can
            see that data on the blockchain.
          </li>
          <li>
            <b>Optional alerts.</b> If you connect Telegram or turn on browser notifications, the identifiers needed to deliver them are stored
            for that purpose.
          </li>
          <li>
            <b>Technical logs.</b> Servers and hosting providers keep standard request logs (such as IP address and browser) for security and
            reliability.
          </li>
          <li>
            <b>Voice and chat.</b> If you use the voice assistant, your browser may send audio to its own speech service. Questions you ask the
            assistant are processed to produce an answer.
          </li>
        </ul>
        <p>
          Riven does not sell personal data. Third-party content embedded on pages (charts, maps, analytics) may set its own cookies or collect
          its own data under its own policies. You can clear local storage and cookies in your browser at any time.
        </p>
      </>
    ),
  },
  {
    id: "third-parties",
    title: "Third-party services",
    body: (
      <p>
        Riven depends on and links to services it does not control, including Arc network nodes, DexScreener, TradingView, Bubblemaps,
        Hyperliquid, Telegram and your wallet provider. Your use of those services is under their own terms. Riven is not responsible for their
        availability or conduct.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Disclaimers and limits of liability",
    body: (
      <>
        <p>
          Riven is provided “as is” and “as available”, with no promise that it will be accurate, complete, uninterrupted or error free. To the
          fullest extent permitted by law, Riven and the people behind it are not liable for indirect, incidental, special or consequential
          losses, or for any loss of funds, profits, data or opportunity, however caused, arising from your use of or reliance on the service.
        </p>
        <p>
          If liability cannot be excluded, it is limited to the greatest extent the law allows. Nothing in these terms limits rights or
          liabilities that cannot be limited by law.
        </p>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "Your responsibility",
    body: (
      <p>
        You are responsible for your own decisions, transactions, taxes and compliance with the laws that apply to you. You agree to cover
        claims and losses caused by your breach of these terms or your unlawful use of Riven, to the extent permitted by law.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes, termination and law",
    body: (
      <>
        <p>
          Riven may update these terms and will change the “last updated” date when it does. Using the service after a change means you accept
          the new terms. Riven may suspend or end access at any time, and you may stop using it at any time.
        </p>
        <p>
          These terms are governed by the laws that apply where the Riven operator is established, and disputes are for the courts of that
          place, unless mandatory consumer law where you live says otherwise. If any part of these terms is unenforceable, the rest still
          applies.
        </p>
      </>
    ),
  },
]

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms and Conditions"
      updated="October 14, 2026"
      other={{ href: "/disclaimer", label: "the Disclaimer" }}
      intro={
        <p>
          These terms explain what Riven is and the rules for using it. In short: Riven shows evidence about Arc tokens, it never holds your
          money, and every decision and transaction is yours.
        </p>
      }
      sections={SECTIONS}
    />
  )
}
