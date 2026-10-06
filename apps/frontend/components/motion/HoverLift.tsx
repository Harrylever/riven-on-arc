"use client"

import { type ReactNode } from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

/** Pointer-driven lift on hover/press, for elements that should feel tactile
 * (CTA buttons) rather than the passive scroll-in of ScrollReveal. */
export function HoverLift({
  children,
  className,
  scale = 1.04,
}: {
  children: ReactNode
  className?: string
  scale?: number
}) {
  return (
    <motion.div
      className={cn("inline-block", className)}
      whileHover={{ scale }}
      whileTap={{ scale: scale * 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      {children}
    </motion.div>
  )
}
