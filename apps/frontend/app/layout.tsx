import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { cn } from "@/lib/utils"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/toast"
import { RivenShell } from "@/components/riven/riven-shell"
import { ReactNode } from "react"
import {
  buildSiteJsonLd,
  getSiteUrl,
  serializeJsonLd,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/site"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

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
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
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
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
  icons: {
    // /favicon.ico is served from app/favicon.ico; the PNGs live in public/.
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: "#0f0f12",
  colorScheme: "dark",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const siteJsonLd = serializeJsonLd(buildSiteJsonLd(getSiteUrl()))
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", "font-sans", inter.variable)}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: siteJsonLd }}
        />
      </head>
      <body className="rv-body text-foreground flex min-h-full flex-col">
        <TooltipProvider>
          <RivenShell>{children}</RivenShell>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  )
}
