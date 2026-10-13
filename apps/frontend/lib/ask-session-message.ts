// Shared by the browser (to build what the wallet signs) and the server (to
// check it). No secrets or node-only imports here.

export interface SignInFields {
  domain: string
  address: string
  nonce: string
  issuedAt: string
}

export function signInMessage(f: SignInFields): string {
  return [
    `${f.domain} wants you to verify your wallet for Ask Riven.`,
    "",
    `Address: ${f.address}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
    "",
    "This only proves you own this wallet. It sends no transaction and costs nothing.",
  ].join("\n")
}

export function parseSignInMessage(message: string): SignInFields | null {
  const m = message.match(
    /^(.+) wants you to verify your wallet for Ask Riven\.\n\nAddress: (0x[0-9a-fA-F]{40})\nNonce: ([0-9a-f.]+)\nIssued At: (\S+)\n\nThis only proves/,
  )
  if (!m) return null
  return { domain: m[1]!, address: m[2]!, nonce: m[3]!, issuedAt: m[4]! }
}
