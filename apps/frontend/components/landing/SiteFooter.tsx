export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] py-10">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-3 px-6">
        <span
          className="text-sm font-extrabold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          CLAW<span style={{ color: "var(--brand)" }}>DEX</span>
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          Arc launch intelligence, with scores held until on-chain facts are
          verified.
        </span>
        <span className="ml-auto font-mono text-[11px] text-[var(--text-muted)]">
          THE SCORE IS NEVER SOLD
        </span>
      </div>
    </footer>
  )
}
