const JUPITER_QUOTE_URL = 'https://quote-api.jup.ag/v6/quote';

export interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amountLamports: string;
  slippageBps: number;
}

/** Read-only: fetches a swap quote. No signing, no execution — that's blocked on the custody decision (see trade.service.ts). */
export async function getSwapQuote(params: JupiterQuoteParams) {
  const url = new URL(JUPITER_QUOTE_URL);
  url.searchParams.set('inputMint', params.inputMint);
  url.searchParams.set('outputMint', params.outputMint);
  url.searchParams.set('amount', params.amountLamports);
  url.searchParams.set('slippageBps', String(params.slippageBps));

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Jupiter quote failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
