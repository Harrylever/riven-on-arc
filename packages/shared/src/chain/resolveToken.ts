import { getDb } from "../db/client.js";
import { getAssetByMint } from "./heliusRpc.js";

/**
 * On-demand CA-search resolution (final spec: "Any token can be opened by
 * contract address search. Tokens that were not detected at launch are
 * resolved on demand."). Checks the DB first; if missing, fetches basic
 * metadata via Helius and creates a minimal Token row.
 *
 * KNOWN GAP: `getAsset` does not reliably return a token's actual creation
 * time, so `launchTime` here is "when we first saw it," not the real launch
 * time. Fine for now — flagged so it isn't mistaken for accurate launch data.
 */
export async function resolveTokenByMint(mint: string, rpcUrl: string, forceUpdate = false) {
  const db = getDb();

  const existing = await db.token.findUnique({ where: { mint } });
  if (existing && !forceUpdate && existing.name !== "Unknown" && existing.symbol !== "???") {
    return existing;
  }

  const asset = await getAssetByMint(mint, rpcUrl);
  if (!asset) return existing ?? null;

  const name = asset.content?.metadata?.name ?? existing?.name ?? "Unknown";
  const symbol = asset.content?.metadata?.symbol ?? existing?.symbol ?? "???";
  const deployerWallet =
    asset.creators?.find((c) => c.verified)?.address ??
    asset.authorities?.[0]?.address ??
    existing?.deployerWallet ??
    "unknown";
  const initialSupply =
    asset.token_info?.supply != null
      ? String(asset.token_info.supply)
      : existing?.initialSupply
      ? String(existing.initialSupply)
      : "0";
  const decimals = asset.token_info?.decimals ?? existing?.decimals ?? null;
  const imageUri =
    (asset.content as any)?.links?.image ??
    (asset.content as any)?.files?.[0]?.cdn_uri ??
    (asset.content as any)?.files?.[0]?.uri ??
    existing?.imageUri ??
    null;
  const metadataUri = (asset.content as any)?.json_uri ?? existing?.metadataUri ?? null;

  if (existing) {
    return db.token.update({
      where: { id: existing.id },
      data: {
        name,
        symbol,
        decimals,
        imageUri,
        metadataUri,
        initialSupply,
        ...(deployerWallet !== "unknown" ? { deployerWallet } : {}),
      },
    });
  }

  return db.token.create({
    data: {
      mint,
      name,
      symbol,
      decimals,
      imageUri,
      metadataUri,
      deployerWallet,
      initialSupply,
      launchTime: new Date(),
      launchpad: "OTHER",
      discoveredVia: "ON_DEMAND_RESOLUTION",
    },
  });
}
