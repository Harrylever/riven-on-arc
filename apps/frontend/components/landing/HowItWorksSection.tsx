const HOW_IT_WORKS = [
  {
    n: "01",
    title: "Arc factory scan",
    body: "A resumable worker scans configured launchpad logs in bounded Arc mainnet block ranges.",
  },
  {
    n: "02",
    title: "Contract facts are checked",
    body: "ERC-20 metadata and EVM authority indicators are read from chain. Bytecode checks are labeled as heuristics.",
  },
  {
    n: "03",
    title: "Scores wait for verification",
    body: "Launch decoding and the four-signal score stay disabled until launch event formats and scoring inputs are verified.",
  },
]

export function HowItWorksSection() {
  return (
    <section className="border-t border-[var(--border)] py-20">
      <div className="mx-auto w-full max-w-[1120px] px-6">
        <div className="mb-3 font-mono text-[11px] font-semibold tracking-[0.12em] text-[var(--brand)] uppercase">
          How it works
        </div>
        <h2
          className="max-w-[680px] text-[26px] font-bold tracking-tight sm:text-[32px]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Three steps, none of them yours.
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {HOW_IT_WORKS.map((s) => (
            <div
              key={s.n}
              className="rounded-none border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="font-mono text-xs font-semibold text-[var(--brand)]">
                {s.n}
              </div>
              <div
                className="mt-3 text-[19px] font-bold"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {s.title}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
