import Link from "next/link"
import { Button } from "@/components/ui/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons"

export function FinalCtaSection() {
  return (
    <section className="border-t border-[var(--border)] bg-[var(--surface-sunken)] py-20 text-center">
      <div className="mx-auto w-full max-w-[1120px] px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-mark.png"
          alt="ClawDex"
          className="mx-auto mb-4 h-12"
        />
        <h2
          className="text-[28px] font-extrabold tracking-tight sm:text-[40px]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Trade with clarity. Never blind trust.
        </h2>
        <p className="mx-auto mt-3 max-w-[440px] text-[15px] leading-relaxed text-[var(--text-muted)]">
          No paywalls, no paid promotions. Credibility is the product.
        </p>
        <div className="mt-7 flex justify-center">
          <Button
            size="lg"
            nativeButton={false}
            render={
              <Link href="/terminal" className="gap-2">
                Open Terminal
                <HugeiconsIcon
                  icon={ArrowUpRight01Icon}
                  className="size-[18px]"
                  strokeWidth={2}
                />
              </Link>
            }
          />
        </div>
      </div>
    </section>
  )
}
