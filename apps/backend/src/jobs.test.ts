import { expect, test } from "bun:test";
import { createServices } from "./container";
import { startJobs } from "./jobs";

test("solana mode registers legacy cron jobs on the expected cadences", () => {
  process.env.CHAIN_MODE = "solana";
  const jobs = startJobs(createServices());
  try {
    expect(jobs).toHaveLength(13);
    const byName = Object.fromEntries(
      jobs.map((j) => [j.name, j.getPattern()]),
    );
    expect(byName["scoring.scoreAll"]).toBe("0 */5 * * * *");
    expect(byName["arcPipeline.runOnce"]).toBe("0 * * * * *");
    expect(byName["arcScoring.scoreOnce"]).toBe("0 * * * * *");
    expect(byName["telegram.tick"]).toBe("*/20 * * * * *");
    expect(byName["snapshot.computeSnapshots"]).toBe("0 * * * * *");
    expect(byName["retention.pruneOldRows"]).toBe("0 0 3 * * *");
    expect(byName["kol.pollRecentTrades"]).toBe("0 */30 * * * *");
    for (const j of jobs) expect(j.nextRun()).toBeInstanceOf(Date);
  } finally {
    jobs.forEach((j) => j.stop());
    delete process.env.CHAIN_MODE;
  }
});

test("with CHAIN_MODE unset, only Arc indexing runs (no stray Solana jobs)", () => {
  delete process.env.CHAIN_MODE;
  const jobs = startJobs(createServices());
  try {
    expect(jobs.map((j) => j.name)).toEqual(["arcPipeline.runOnce", "telegram.tick", "arcScoring.scoreOnce"]);
  } finally {
    jobs.forEach((j) => j.stop());
  }
});

test("Arc mode schedules only Arc indexing and avoids legacy Solana polling", () => {
  process.env.CHAIN_MODE = "arc";
  const jobs = startJobs(createServices());
  try {
    expect(jobs.map((j) => j.name)).toEqual(["arcPipeline.runOnce", "telegram.tick", "arcScoring.scoreOnce"]);
  } finally {
    jobs.forEach((j) => j.stop());
    delete process.env.CHAIN_MODE;
  }
});
