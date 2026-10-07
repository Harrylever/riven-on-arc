import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { cn } from "@/lib/utils"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/toast"
import { RivenShell } from "@/components/riven/riven-shell"
import { ReactNode } from "react"
import {
  getSiteUrl,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/site"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" })

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "Riven",
    "Arc",
    "Arc mainnet",
    "Argus",
    "Tolly",
    "token screener",
    "rug check",
    "on-chain score",
    "EVM contract analysis",
    "Arc launches",
  ],
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  category: "finance",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/brand/riven-splash.png",
  },
}

export const viewport: Viewport = {
  themeColor: "#0f0f12",
  colorScheme: "dark",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        "font-sans",
        inter.variable,
      )}
    >
      <body className="rv-body text-foreground flex min-h-full flex-col">
        <TooltipProvider>
          <RivenShell>{children}</RivenShell>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  )
}
