import { isMockMode } from "@/lib/api"

export function MockBanner() {
  if (!isMockMode()) return null

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-1.5 text-center text-xs font-semibold tracking-wider text-amber-700 uppercase backdrop-blur dark:text-amber-300"
    >
      <span className="size-2 animate-pulse rounded-full bg-amber-500" />
      <span>MOCK DATA MODE ACTIVE — Not connected to live chain</span>
    </div>
  )
}
