-- Arc launch sources verified on 2026-10-06 (Argus, Tolly) and their pool venues.
ALTER TYPE "launchpad" ADD VALUE IF NOT EXISTS 'ARGUS';
ALTER TYPE "launchpad" ADD VALUE IF NOT EXISTS 'TOLLY';
ALTER TYPE "discovery_source" ADD VALUE IF NOT EXISTS 'ARC_FACTORY_INDEXER';
ALTER TYPE "pool_venue" ADD VALUE IF NOT EXISTS 'UNISWAP_V4';
ALTER TYPE "pool_venue" ADD VALUE IF NOT EXISTS 'BONDING_CURVE';
