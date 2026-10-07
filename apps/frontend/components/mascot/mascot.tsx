"use client"

import dynamic from "next/dynamic"
import type { RivenMascotProps } from "./riven-mascot"
import { RivenOrb } from "@/components/riven/orb-field"

export type { Holo, Mood } from "./riven-mascot"

/** Lazy, client-only: three.js never ships in the first paint or the server bundle. */
const Lazy = dynamic(() => import("./riven-mascot"), {
  ssr: false,
  loading: () => (
    <div className="grid size-full place-items-center">
      <RivenOrb state="working" size={64} label="Loading Riven" />
    </div>
  ),
})

export function Mascot(props: RivenMascotProps) {
  return <Lazy {...props} />
}
