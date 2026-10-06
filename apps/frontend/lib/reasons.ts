/**
 * Plain-English names for the flag codes that get a token flagged. Evidence
 * wording ("liquidity pulled"), never an accusation ("scam") — every one of
 * these is something a user can verify on the explorer.
 */
export const REASON_LABEL: Record<string, { label: string; hint: string }> = {
  WASH: {
    label: "Fake volume",
    hint: "Daily volume over 50× the USDC in the pool — trading in circles",
  },
  SERIAL: {
    label: "Serial launcher",
    hint: "The creator wallet has launched 10+ tokens",
  },
  CREATOR_DUMP: {
    label: "Creator sold out",
    hint: "The creator sold 75%+ of the tokens they received",
  },
  LP_REMOVED: {
    label: "Liquidity pulled",
    hint: "Most of the launch liquidity was taken out of the pool",
  },
  DEAD: {
    label: "Dead",
    hint: "Holders own almost nothing and nobody traded in 24h",
  },
  IMPERSONATION: {
    label: "Impersonation",
    hint: "Uses an official name like USDC or Circle",
  },
}
