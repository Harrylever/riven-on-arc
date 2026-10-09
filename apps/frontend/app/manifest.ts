import type { MetadataRoute } from "next"
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Arc launch scanner`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#030a14", // --deep-blue
    theme_color: "#030a14",
    icons: [
      {
        src: "/brand/riven-splash.png",
        sizes: "768x768",
        type: "image/png",
      },
    ],
  }
}
