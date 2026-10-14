import { describe, it, expect } from 'vitest';
import { diceSumPmf, ALLOCATION_DIST, chiSquareCdf, chiSquareUniform, winProbability, eloExpected } from './stats';
import { rollDice } from './mathLogic';

describe('dice distributions', () => {
  it('6d8 sum distribution sums to 1 and has mean 27', () => {
    const pmf = diceSumPmf(6, 8);
    expect(pmf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(pmf.reduce((a, p, x) => a + p * x, 0)).toBeCloseTo(27, 10);
  });
  it('best-of-three allocation roll has mean ~31.76', () => {
    expect(ALLOCATION_DIST.mean).toBeCloseTo(31.76, 1);
    expect(ALLOCATION_DIST.pmf[6]).toBeGreaterThan(0);
    expect(ALLOCATION_DIST.pmf.length - 1).toBe(48);
  });
});

describe('chi-square', () => {
  it('matches known critical values', () => {
    expect(chiSquareCdf(14.067, 7)).toBeCloseTo(0.95, 3);
    expect(chiSquareCdf(3.841, 1)).toBeCloseTo(0.95, 3);
  });
  it('Rule 30 d8 rolls pass a uniformity test', () => {
    const faces = new Array(8).fill(0);
    for (let i = 0; i < 40000; i++) faces[rollDice(1, 8) - 1]++;
    expect(chiSquareUniform(faces).pValue).toBeGreaterThan(0.001);
  });
});

describe('rating maths', () => {
  it('logistic win probability is symmetric', () => {
    expect(winProbability(0)).toBeCloseTo(0.5, 10);
    expect(winProbability(200) + winProbability(-200)).toBeCloseTo(1, 10);
  });
  it('Elo expectation for a 400 point gap is ~0.909', () => {
    expect(eloExpected(1800, 1400)).toBeCloseTo(0.909, 3);
  });
});
