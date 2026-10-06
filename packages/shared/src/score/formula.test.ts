import { test } from "bun:test";
import assert from "node:assert/strict";
import { computeAuthorityGate, computeScore, scoreBand } from "./formula.js";
import {
  deriveBurnScore,
  deriveConcentrationScore,
  deriveLiquidityScore,
} from "./inputs.js";

const CLEAN = { mintAuthorityActive: false, freezeAuthorityActive: false, lpLocked: true };

test("gate: 0 failures = 1, 1 failure = 0.5, 2+ = 0", () => {
  assert.equal(computeAuthorityGate(CLEAN).gate, 1);
  assert.equal(computeAuthorityGate({ ...CLEAN, lpLocked: false }).gate, 0.5);
  const bad = computeAuthorityGate({ mintAuthorityActive: true, freezeAuthorityActive: true, lpLocked: true });
  assert.equal(bad.gate, 0);
  assert.equal(bad.redFlags.length, 2);
});

test("perfect token with no burns can reach 100 (burns are a bonus, not a requirement)", () => {
  const r = computeScore({ authorityGate: CLEAN, concentrationScore: 10, burnScore: null, liquidityScore: 10 });
  assert.equal(r.score, 100);
  assert.equal(r.partial, false);
  assert.equal(r.confidence, "high");
  assert.equal(scoreBand(r.score), "green");
});

test("burn bonus is additive and capped at 100", () => {
  const mid = { authorityGate: CLEAN, concentrationScore: 5, liquidityScore: 5 };
  assert.equal(computeScore({ ...mid, burnScore: null }).score, 50);
  assert.equal(computeScore({ ...mid, burnScore: 10 }).score, 65);
  const top = computeScore({ authorityGate: CLEAN, concentrationScore: 10, liquidityScore: 10, burnScore: 10 });
  assert.equal(top.score, 100);
});

test("a tiny burn never scores lower than no burn", () => {
  const base = { authorityGate: CLEAN, concentrationScore: 7, liquidityScore: 7 };
  assert.ok(computeScore({ ...base, burnScore: 0.1 }).score >= computeScore({ ...base, burnScore: null }).score);
});

test("gate 0.5 halves the score", () => {
  const r = computeScore({
    authorityGate: { ...CLEAN, lpLocked: false },
    concentrationScore: 10, burnScore: null, liquidityScore: 10,
  });
  assert.equal(r.score, 50);
});

test("gate 0 caps at 20 but lets low scores show through", () => {
  const dead = { mintAuthorityActive: true, freezeAuthorityActive: true, lpLocked: false };
  assert.equal(computeScore({ authorityGate: dead, concentrationScore: 10, burnScore: 10, liquidityScore: 10 }).score, 20);
  assert.equal(computeScore({ authorityGate: dead, concentrationScore: 1, burnScore: null, liquidityScore: 1 }).score, 10);
});

test("missing signals renormalize and flag partial", () => {
  const r = computeScore({ authorityGate: CLEAN, concentrationScore: 8, burnScore: null, liquidityScore: null });
  assert.equal(r.score, 80);
  assert.equal(r.partial, true);
  assert.equal(r.confidence, "low");
  assert.equal(r.liquidityScore, 0);
});

test("missing authority check => gate 1 but partial/low confidence", () => {
  const r = computeScore({ authorityGate: null, concentrationScore: 10, burnScore: null, liquidityScore: 10 });
  assert.equal(r.gate, 1);
  assert.equal(r.partial, true);
});

test("nothing measurable => neutral 50, partial", () => {
  const r = computeScore({ authorityGate: null, concentrationScore: null, burnScore: null, liquidityScore: null });
  assert.equal(r.score, 50);
  assert.equal(r.partial, true);
});

test("input derivations clamp to 0-10", () => {
  assert.equal(deriveConcentrationScore(0.3), 7);
  assert.equal(deriveConcentrationScore(1.5), 0);
  assert.equal(deriveBurnScore(0.05), 5);
  assert.equal(deriveBurnScore(0.5), 10);
  assert.equal(deriveLiquidityScore(0.075), 5);
  assert.equal(deriveLiquidityScore(1), 10);
  assert.equal(deriveLiquidityScore(-1), 0);
});

test("scoreBand thresholds", () => {
  assert.equal(scoreBand(70), "green");
  assert.equal(scoreBand(69), "yellow");
  assert.equal(scoreBand(50), "yellow");
  assert.equal(scoreBand(49), "red");
});
