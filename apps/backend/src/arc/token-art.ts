// Where a token keeps its picture. Argus and Tolly put it in their launch event. Other launchpads' contracts
// expose it themselves, in one of two ways Riven reads: `logo()` returning an image address, or `tokenURI()`
// returning a small JSON document ({"image": "...", "website": "...", "twitter": "..."}) embedded in the call
// itself as a data: URI. The biggest tokens by volume on Arc use the second form, which is why they showed initials.
//
// Everything here comes from the token's creator, so it is untrusted: only image *addresses* are accepted (never an
// embedded image, which could be huge), and only ipfs://, ar:// or https:// ones.

const IMAGE_ADDRESS = /^(ipfs:\/\/|ar:\/\/|https:\/\/)\S+$/;
/** An embedded JSON document larger than this is not a launchpad's tiny metadata. */
const MAX_DATA_URI_CHARS = 20_000;
/** Public gateways serve the same content as ipfs://: store the stable form so the site can pick a working gateway. */
const PUBLIC_GATEWAY = /^https:\/\/(?:ipfs\.io|dweb\.link|gateway\.ipfs\.io|w3s\.link|nftstorage\.link|cloudflare-ipfs\.com)\/ipfs\/(.+)$/i;

function clean(s: string, max = 400): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

/** An image address worth storing, or null. Public IPFS gateway links become ipfs://. */
export function imageAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = clean(raw);
  if (!IMAGE_ADDRESS.test(s)) return null;
  const gateway = PUBLIC_GATEWAY.exec(s);
  return gateway ? `ipfs://${gateway[1]}` : s;
}

/** The decoded JSON of a `data:application/json[;base64],…` URI, or null for anything else. */
function dataUriJson(uri: string): Record<string, unknown> | null {
  if (uri.length > MAX_DATA_URI_CHARS) return null;
  const m = /^data:application\/json(;[^,]*)?,(.*)$/s.exec(uri);
  if (!m) return null;
  try {
    const body = m[1]?.includes("base64") ? Buffer.from(m[2]!, "base64").toString("utf8") : decodeURIComponent(m[2]!);
    const json = JSON.parse(body) as unknown;
    return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The picture a token's `tokenURI()` points at, if it embeds its metadata. */
export function imageFromTokenUri(uri: unknown): string | null {
  if (typeof uri !== "string") return null;
  const json = dataUriJson(uri);
  return json ? imageAddress(json.image) : null;
}
