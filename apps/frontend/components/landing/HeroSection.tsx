import Link from "next/link"
import { Button } from "@/components/ui/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons"
import { HoverLift } from "@/components/motion/HoverLift"
import { HeroTickerMarquee } from "@/components/landing/HeroTickerMarquee"

export function HeroSection() {
  return (
    <section className="relative flex min-h-[88vh] flex-col overflow-hidden pt-10 pb-0 sm:min-h-[90vh] sm:pt-16">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(620px 420px at 18% -5%, rgba(22,140,255,0.20), transparent 60%), " +
            "radial-gradient(520px 480px at 88% 8%, rgba(166,228,255,0.14), transparent 65%), " +
            "radial-gradient(800px 520px at 50% 105%, rgba(66,200,255,0.12), transparent 70%)",
        }}
      />

      <div className="relative mx-auto my-auto flex w-full max-w-[1120px] flex-1 items-center justify-center px-6 py-8 sm:py-12">
        <div className="mx-auto max-w-[640px] text-center">
          <div className="mb-4 font-mono text-[11px] font-semibold tracking-[0.12em] text-[var(--brand)] uppercase">
            Arc launch intelligence · Chain ID 5042
          </div>
          <h1
            className="text-[38px] leading-[1.02] font-extrabold tracking-tight sm:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            On-chain truth{" "}
            <span className="text-[var(--brand)]">for every launch.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[480px] text-[17px] leading-relaxed text-[var(--text-secondary)]">
            Arc launch records are being indexed and verified before ClawDex
            publishes token scores or risk explanations.
          </p>
          <div className="mx-auto mt-9 flex w-full max-w-xs flex-col items-center justify-center gap-3 sm:max-w-none sm:flex-row">
            <HoverLift className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto"
                nativeButton={false}
                render={
                  <Link href="/terminal" className="justify-center gap-2">
                    Open Terminal
                    <HugeiconsIcon
                      icon={ArrowUpRight01Icon}
                      className="size-[18px]"
                      strokeWidth={2}
                    />
                  </Link>
                }
              />
            </HoverLift>
            <HoverLift className="w-full sm:w-auto">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
                nativeButton={false}
                render={
                  <Link href="#score" className="justify-center">
                    Learn more
                  </Link>
                }
              />
            </HoverLift>
          </div>
        </div>
      </div>

      <div className="mt-auto w-full">
        <HeroTickerMarquee />
      </div>
    </section>
  )
}
