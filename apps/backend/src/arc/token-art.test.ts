import { describe, expect, test } from "bun:test"
import { imageAddress, imageFromTokenUri } from "./token-art"

const dataUri = (obj: unknown) => `data:application/json;base64,${Buffer.from(JSON.stringify(obj)).toString("base64")}`

describe("imageFromTokenUri", () => {
  test("reads the image from the embedded JSON the big launchpad tokens use", () => {
    const uri = dataUri({ description: "Pump V1", website: "https://x.example", image: "https://ipfs.io/ipfs/QmAbc", twitter: "@t" })
    expect(imageFromTokenUri(uri)).toBe("ipfs://QmAbc")
  })
  test("handles unencoded and percent-encoded JSON too", () => {
    expect(imageFromTokenUri('data:application/json,{"image":"ipfs://bafyX"}')).toBe("ipfs://bafyX")
    expect(imageFromTokenUri("data:application/json;utf8," + encodeURIComponent('{"image":"https://cdn.example/a.png"}'))).toBe("https://cdn.example/a.png")
  })
  test("ignores tokens with no image, bad JSON, or a different kind of URI", () => {
    expect(imageFromTokenUri(dataUri({ description: "no art" }))).toBeNull()
    expect(imageFromTokenUri("data:application/json;base64,!!!not-base64-json")).toBeNull()
    expect(imageFromTokenUri("https://example.com/meta.json")).toBeNull() // a URL to fetch: not followed
    expect(imageFromTokenUri(dataUri(["image"]))).toBeNull()
    expect(imageFromTokenUri(undefined)).toBeNull()
  })
  test("never stores an embedded image or a script address, only a plain image address", () => {
    expect(imageFromTokenUri(dataUri({ image: "data:image/svg+xml;base64,PHN2Zz4=" }))).toBeNull()
    expect(imageFromTokenUri(dataUri({ image: "javascript:alert(1)" }))).toBeNull()
    expect(imageFromTokenUri(dataUri({ image: "http://insecure.example/a.png" }))).toBeNull()
  })
  test("a document too large to be launchpad metadata is rejected", () => {
    expect(imageFromTokenUri(dataUri({ image: "ipfs://x", pad: "a".repeat(30_000) }))).toBeNull()
  })
})

describe("imageAddress", () => {
  test("public gateway links are stored as ipfs://, a dedicated gateway is kept", () => {
    expect(imageAddress("https://ipfs.io/ipfs/QmAbc/logo.png")).toBe("ipfs://QmAbc/logo.png")
    expect(imageAddress("https://dweb.link/ipfs/QmAbc")).toBe("ipfs://QmAbc")
    expect(imageAddress("https://mine.mypinata.cloud/ipfs/QmAbc")).toBe("https://mine.mypinata.cloud/ipfs/QmAbc")
  })
  test("strips control characters (Postgres rejects NUL) and rejects spaces", () => {
    expect(imageAddress("ipfs://Qm\u0000Abc")).toBe("ipfs://QmAbc")
    expect(imageAddress("ipfs://has space")).toBeNull()
  })
})
