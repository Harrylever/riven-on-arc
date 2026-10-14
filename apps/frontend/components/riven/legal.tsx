import Link from "next/link"
import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"

export interface LegalSection {
  id: string
  title: string
  body: ReactNode
}

/** The shared layout for the legal pages: a header, a contents list, then numbered sections. */
export function LegalPage({
  eyebrow,
  title,
  updated,
  intro,
  sections,
  other,
}: {
  eyebrow: string
  title: string
  updated: string
  intro: ReactNode
  sections: LegalSection[]
  other: { href: string; label: string }
}) {
  return (
    <article className="flex flex-col gap-4 text-[15px] leading-relaxed text-[var(--rv-ink-2)]">
      <Card variant="riven" as="header" className="p-5 sm:p-7">
        <p className="text-[12px] font-semibold tracking-[0.18em] text-[var(--rv-blue)] uppercase">{eyebrow}</p>
        <h1 className="mt-2 text-[32px] leading-tight font-extrabold text-[var(--rv-ink)] sm:text-[40px]">{title}</h1>
        <p className="rv-num mt-1 text-[12px] text-[var(--rv-ink-3)]">Last updated {updated}</p>
        <div className="mt-3 max-w-2xl">{intro}</div>
      </Card>

      <Card variant="riven" as="nav" className="p-5" aria-label="On this page">
        <p className="text-[12px] font-semibold tracking-[0.14em] text-[var(--rv-ink-3)] uppercase">On this page</p>
        <ol className="mt-2 grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-2">
          {sections.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-[var(--rv-ice)] hover:underline">
                {i + 1}. {s.title}
              </a>
            </li>
          ))}
        </ol>
      </Card>

      {sections.map((s, i) => (
        <Card variant="riven" as="section" key={s.id} id={s.id} className="scroll-mt-20 p-5 sm:p-6">
          <h2 className="text-[19px] font-bold text-[var(--rv-ink)]">
            {i + 1}. {s.title}
          </h2>
          <div className="mt-2 flex flex-col gap-3 [&_li]:ml-1 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_b]:text-[var(--rv-ink)]">{s.body}</div>
        </Card>
      ))}

      <p className="text-[13px] text-[var(--rv-ink-3)]">
        See also{" "}
        <Link href={other.href} className="text-[var(--rv-ice)] hover:underline">
          {other.label}
        </Link>{" "}
        and{" "}
        <Link href="/methodology" className="text-[var(--rv-ice)] hover:underline">
          how the score works
        </Link>
        .
      </p>
    </article>
  )
}
