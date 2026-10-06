"use client"

import { type ReactNode } from "react"
import { motion } from "framer-motion"

/**
 * Fades and slides children up as they enter the viewport using Framer Motion.
 * Sections already on screen at load animate in immediately, and subsequent
 * sections smoothly ease in as they scroll into view.
 */
export function ScrollReveal({
  children,
  delay = 0,
  y = 24,
  duration = 0.7,
  className,
}: {
  children: ReactNode
  delay?: number
  y?: number
  duration?: number
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{
        duration,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
