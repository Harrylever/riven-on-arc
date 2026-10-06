"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"

export function LandingSplash() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    // Fade out as soon as the static page has loaded/mounted on the client
    const timer = setTimeout(() => {
      setVisible(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="landing-splash"
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
          }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
        >
          <div className="relative size-24 overflow-hidden">
            <Image
              src="/brand/riven-splash.png"
              alt="Riven emblem"
              width={160}
              height={160}
              priority
              className="absolute top-[-15px] left-[-32px] size-40 max-w-none select-none"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
