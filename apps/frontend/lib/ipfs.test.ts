import { describe, expect, test } from "bun:test"
import { IPFS_FALLBACK_GATEWAY, IPFS_GATEWAY, fallbackImageUrl, imageUrl } from "./ipfs"

describe("imageUrl", () => {
  test("ipfs:// goes through our gateway", () => {
    expect(imageUrl("ipfs://QmAbc/a.png")).toBe(IPFS_GATEWAY + "QmAbc/a.png")
  })
  test("another public gateway's link is served from ours, since those throttle", () => {
    expect(imageUrl("https://ipfs.io/ipfs/QmAbc")).toBe(IPFS_GATEWAY + "QmAbc")
    expect(imageUrl("https://dweb.link/ipfs/QmAbc")).toBe(IPFS_GATEWAY + "QmAbc")
  })
  test("a dedicated gateway or ordinary https image is kept; anything else is not loaded", () => {
    expect(imageUrl("https://mine.mypinata.cloud/ipfs/QmAbc")).toBe("https://mine.mypinata.cloud/ipfs/QmAbc")
    expect(imageUrl("https://cdn.example/a.png")).toBe("https://cdn.example/a.png")
    expect(imageUrl("javascript:alert(1)")).toBeNull()
    expect(imageUrl("data:image/png;base64,AAAA")).toBeNull()
    expect(imageUrl(null)).toBeNull()
  })
})

describe("fallbackImageUrl", () => {
  test("swaps our gateway for the fallback, and leaves other hosts alone", () => {
    expect(fallbackImageUrl(IPFS_GATEWAY + "QmAbc")).toBe(IPFS_FALLBACK_GATEWAY + "QmAbc")
    expect(fallbackImageUrl("https://cdn.example/a.png")).toBeNull()
    expect(fallbackImageUrl(IPFS_FALLBACK_GATEWAY + "QmAbc")).toBeNull()
  })
})
