"use client"

import { useRouter } from "next/navigation"
import { useTransition, type MouseEvent } from "react"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

/** The shadcn Pagination links, restyled to Riven's chips. The base styles are large, squared and uppercase. */
const PAGE_ITEM =
  "rv-num h-[30px] min-w-8 rounded-md border border-[color:var(--rv-stroke)] bg-[var(--rv-card)] px-2 text-[12px] font-semibold tracking-normal normal-case text-[var(--rv-ink-2)] hover:bg-[var(--rv-card-hover)] hover:text-[var(--rv-ink)] aria-[current=page]:border-[color:var(--rv-blue)] aria-[current=page]:bg-[var(--rv-blue)] aria-[current=page]:text-[var(--rv-on-blue)] aria-disabled:pointer-events-none aria-disabled:opacity-30"

/**
 * Paging for any list, on the shadcn Pagination. The page numbers are real links (open one in a new tab if you like);
 * a plain click changes page without a full reload.
 *
 * - `pages` known: numbered pages with ellipses (1 … 4 5 6 … 214).
 * - `pages` omitted: Previous, the current page, Next. For lists where counting everything would be slow, `hasNext`
 *   comes from fetching one extra row.
 *
 * `onPage` replaces the default navigation (for a list that scrolls somewhere or runs its own transition).
 */
export function PageNav({
  page,
  pages,
  hasNext = false,
  hrefFor: hrefForProp,
  path,
  query,
  onPage,
  className,
}: {
  page: number
  pages?: number
  hasNext?: boolean
  /** Builds each page's address. A server component can't pass a function, so it gives `path` and `query` instead. */
  hrefFor?: (page: number) => string
  path?: string
  query?: Record<string, string>
  onPage?: (page: number) => void
  className?: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const hrefFor =
    hrefForProp ??
    ((n: number) => {
      const q = new URLSearchParams(query)
      if (n > 1) q.set("page", String(n))
      else q.delete("page")
      const str = q.toString()
      return str ? `${path ?? ""}?${str}` : (path ?? "")
    })
  const last = pages ?? (hasNext ? page + 1 : page)
  if (last <= 1 && page <= 1) return null

  const go = (n: number) => (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return // let "open in a new tab" work
    e.preventDefault()
    if (onPage) onPage(n)
    else startTransition(() => router.push(hrefFor(n)))
  }
  const shown =
    pages === undefined
      ? [page]
      : [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])]
          .filter((n) => n >= 1 && n <= pages)
          .sort((a, b) => a - b)
  // An ellipsis that would hide a single page is just that page.
  const numbers = shown.flatMap((n, i) =>
    i > 0 && n - shown[i - 1]! === 2 ? [n - 1, n] : [n],
  )
  const atEnd = pages === undefined ? !hasNext : page >= pages

  return (
    <Pagination aria-label="Pages" className={className ?? "py-1"}>
      <PaginationContent className="flex-wrap justify-center gap-1.5">
        <PaginationItem>
          <PaginationPrevious
            text="Prev"
            href={hrefFor(Math.max(1, page - 1))}
            role="link"
            aria-disabled={page <= 1}
            tabIndex={page <= 1 ? -1 : undefined}
            onClick={page > 1 ? go(page - 1) : (e) => e.preventDefault()}
            className={PAGE_ITEM}
          />
        </PaginationItem>
        {numbers.map((n, i) => (
          <PaginationItem key={n} className="contents">
            {i > 0 && n - numbers[i - 1]! > 1 && (
              <PaginationEllipsis className="size-auto px-1 text-[12px] text-[var(--rv-ink-3)]" />
            )}
            <PaginationLink
              href={hrefFor(n)}
              role="link"
              isActive={n === page}
              size="default"
              onClick={go(n)}
              className={PAGE_ITEM}
            >
              {n}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            text="Next"
            href={hrefFor(
              pages === undefined ? page + 1 : Math.min(pages, page + 1),
            )}
            role="link"
            aria-disabled={atEnd}
            tabIndex={atEnd ? -1 : undefined}
            onClick={!atEnd ? go(page + 1) : (e) => e.preventDefault()}
            className={PAGE_ITEM}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
