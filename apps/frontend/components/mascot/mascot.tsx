"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
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

/** Weak phones and data-saver users get the light orb: three.js is ~hundreds of KB of JS plus a WebGL context. */
function useLiteDevice() {
  const [lite, setLite] = useState(false)
  useEffect(() => {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
    setLite(
      nav.connection?.saveData === true ||
        (nav.deviceMemory !== undefined && nav.deviceMemory < 4) ||
        (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2),
    )
  }, [])
  return lite
}

export function Mascot(props: RivenMascotProps) {
  const lite = useLiteDevice()
  if (lite) {
    return (
      <div className="grid size-full place-items-center">
        <RivenOrb state="breathing" size={64} label="Riven" />
      </div>
    )
  }
  return <Lazy {...props} />
}
