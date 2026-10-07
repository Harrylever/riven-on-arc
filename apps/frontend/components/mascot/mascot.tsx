"use client"

import dynamic from "next/dynamic"
import type { RivenMascotProps } from "./riven-mascot"

export type { Holo, Mood } from "./riven-mascot"

/** Lazy, client-only: three.js never ships in the first paint or the server bundle. */
const Lazy = dynamic(() => import("./riven-mascot"), {
  ssr: false,
  loading: () => (
    <div className="grid size-full place-items-center">
      <span className="size-10 animate-pulse rounded-full bg-[rgba(124,196,232,0.15)]" />
    </div>
  ),
})

export function Mascot(props: RivenMascotProps) {
  return <Lazy {...props} />
}
