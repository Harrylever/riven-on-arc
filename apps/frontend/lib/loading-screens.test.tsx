import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import HomeLoading from "../app/loading"
import EcosystemLoading from "../app/ecosystem/loading"
import TokenLoading from "../app/token/[mint]/loading"
import TrendingLoading from "../app/trending/loading"
import {
  ListSkeleton,
  SummarySkeleton,
} from "@/components/riven/markets-sections"

const count = (html: string) =>
  (html.match(/data-slot="skeleton"/g) ?? []).length

describe("loading screens are built from the shadcn Skeleton", () => {
  test.each([
    ["home", HomeLoading, 8],
    ["token", TokenLoading, 11],
    ["ecosystem", EcosystemLoading, 5],
    ["trending", TrendingLoading, 20],
  ])(
    "%s shows its placeholders and says it is busy",
    (_name, Screen, atLeast) => {
      const html = renderToStaticMarkup(<Screen />)
      expect(count(html)).toBeGreaterThanOrEqual(atLeast as number)
      expect(html).toContain('aria-busy="true"')
    },
  )
  test("the markets list and summary placeholders", () => {
    expect(count(renderToStaticMarkup(<ListSkeleton />))).toBe(8 * 4) // an avatar, two lines and a value per row
    expect(count(renderToStaticMarkup(<SummarySkeleton />))).toBe(4)
  })
  test("they pulse through the Skeleton alone, not a second hand-written animation", () => {
    for (const Screen of [
      HomeLoading,
      TokenLoading,
      EcosystemLoading,
      TrendingLoading,
    ]) {
      const html = renderToStaticMarkup(<Screen />)
      // the Skeleton adds animate-pulse once per element; no element may carry it twice
      expect(html).not.toMatch(/animate-pulse[^"]*animate-pulse/)
    }
  })
})
