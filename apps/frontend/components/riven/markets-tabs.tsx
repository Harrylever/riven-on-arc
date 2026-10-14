"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { CARD, TAB_LIST, TAB_TRIGGER } from "./card-style"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export interface TabLink {
  id: string
  label: string
  href: string
}

/**
 * The markets lists as shadcn Tabs. Each tab is a real link (so a list can be opened in a new tab or shared) and the
 * selected one follows the URL; the list under it is rendered on the server for the open tab only.
 */
export function MarketsTabs({
  active,
  tabs,
  hint,
  label,
  children,
}: {
  active: string
  tabs: TabLink[]
  /** One honest line about what the open list is, and its limits. */
  hint: string
  label: string
  children: ReactNode
}) {
  return (
    <Card className={CARD} aria-label={label}>
      <Tabs value={active} className="gap-0">
        <div className="border-b border-[var(--rv-stroke)] px-2 sm:px-3">
          <TabsList variant="line" className={`h-11 ${TAB_LIST}`} aria-label="Markets lists">
            {tabs.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                nativeButton={false}
                render={<Link href={t.href} scroll={false} />}
                className={TAB_TRIGGER}
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value={active}>
          <p className="border-b border-[var(--rv-stroke)] px-4 py-2.5 text-[12px] leading-relaxed text-[var(--rv-ink-3)]">{hint}</p>
          {children}
        </TabsContent>
      </Tabs>
    </Card>
  )
}
