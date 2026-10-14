/*
 * Gambit Chess statistics
 * - Exact probability distribution of the allocation roll (best of three 6d8)
 * - Win probability from an engine evaluation (logistic / Elo model)
 * - Elo rating updates for the player vs the computer levels
 * - Pearson chi-square goodness-of-fit test for the Rule 30 dice
 */

// ---------- Dice distributions (exact, by convolution) ----------

// Probability mass function of the sum of `n` fair dice with `sides` faces.
// Returns an array indexed by total (0..n*sides).
export function diceSumPmf(n: number, sides: number): number[] {
  let pmf = [1];
  for (let d = 0; d < n; d++) {
    const next = new Array(pmf.length + sides).fill(0);
    for (let t = 0; t < pmf.length; t++) {
      if (!pmf[t]) continue;
      for (let f = 1; f <= sides; f++) next[t + f] += pmf[t] / sides;
    }
    pmf = next;
  }
  return pmf;
}

// Distribution of the best (maximum) of `k` independent rolls of n d sides:
// P(max = x) = F(x)^k - F(x-1)^k, where F is the single-roll CDF.
export function bestOfPmf(k: number, n: number, sides: number): number[] {
  const single = diceSumPmf(n, sides);
  const out = new Array(single.length).fill(0);
  let cdfPrev = 0, cdf = 0;
  for (let x = 0; x < single.length; x++) {
    cdf += single[x];
    out[x] = Math.pow(cdf, k) - Math.pow(cdfPrev, k);
    cdfPrev = cdf;
  }
  return out;
}

export interface DistSummary {
  pmf: number[];
  mean: number;
  sd: number;
  min: number;
  max: number;
}

export function summarize(pmf: number[]): DistSummary {
  let mean = 0, min = -1, max = 0;
  pmf.forEach((p, x) => { mean += p * x; if (p > 1e-12) { if (min < 0) min = x; max = x; } });
  let v = 0;
  pmf.forEach((p, x) => { v += p * (x - mean) ** 2; });
  return { pmf, mean, sd: Math.sqrt(v), min, max };
}

// Share of outcomes strictly below x, plus half of the ties (mid-rank percentile)
export function percentile(pmf: number[], x: number): number {
  let below = 0;
  for (let i = 0; i < x && i < pmf.length; i++) below += pmf[i];
  return 100 * (below + (pmf[x] ?? 0) / 2);
}

// Probability that the opponent's independent roll is lower / equal / higher than yours
export function headToHead(pmf: number[], yours: number): { win: number; tie: number; lose: number } {
  let lower = 0;
  for (let i = 0; i < yours; i++) lower += pmf[i] ?? 0;
  const tie = pmf[yours] ?? 0;
  return { win: lower, tie, lose: Math.max(0, 1 - lower - tie) };
}

// The allocation roll used by the game: best of three 6d8
export const ALLOCATION_DIST: DistSummary = summarize(bestOfPmf(3, 6, 8));

// ---------- Evaluation -> win probability ----------

// Logistic model used by Elo and by most engine "win %" displays:
// P(win) = 1 / (1 + 10^(-cp / 400))
export function winProbability(centipawns: number): number {
  if (!Number.isFinite(centipawns)) return centipawns > 0 ? 1 : 0;
  return 1 / (1 + Math.pow(10, -centipawns / 400));
}

// ---------- Elo ----------

export function eloExpected(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

// score: 1 win, 0.5 draw, 0 loss. K-factor 40 for new players, 20 afterwards (FIDE-style).
export function eloUpdate(rating: number, opponent: number, score: number, gamesPlayed: number): number {
  const k = gamesPlayed < 30 ? 40 : 20;
  return Math.round(rating + k * (score - eloExpected(rating, opponent)));
}

// Elo difference implied by a match score fraction (0..1)
// Exact inverse of the Elo expectation. A perfect score implies an unbounded gap.
export function eloFromScore(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  return -400 * Math.log10(1 / p - 1);
}

// ---------- Chi-square goodness of fit ----------

// Pearson chi-square statistic for observed counts vs a uniform expectation
export function chiSquareUniform(counts: number[]): { chi2: number; df: number; pValue: number } {
  const n = counts.reduce((a, b) => a + b, 0);
  const e = n / counts.length;
  const chi2 = counts.reduce((a, o) => a + (o - e) ** 2 / e, 0);
  const df = counts.length - 1;
  return { chi2, df, pValue: 1 - chiSquareCdf(chi2, df) };
}

// CDF of the chi-square distribution = regularized lower incomplete gamma P(df/2, x/2)
export function chiSquareCdf(x: number, df: number): number {
  return gammaP(df / 2, x / 2);
}

function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    // series expansion
    let sum = 1 / a, term = sum;
    for (let n = 1; n < 500; n++) { term *= x / (a + n); sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-14) break; }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // continued fraction (Lentz)
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

// ln Γ(z) for z > 0: shift z up with Γ(z) = Γ(z+1)/z, then use Stirling's series
// with its exact Bernoulli-number coefficients. Accurate to ~1e-15 for the
// arguments used here (chi-square needs Γ(df/2)).
function logGamma(z: number): number {
  if (!(z > 0)) throw new Error('logGamma needs z > 0');
  let shift = 0;
  while (z < 15) { shift += Math.log(z); z += 1; }
  const z2 = z * z;
  const series = 1 / (12 * z) - 1 / (360 * z * z2) + 1 / (1260 * z * z2 * z2) - 1 / (1680 * z * z2 * z2 * z2)
    + 1 / (1188 * z * z2 ** 4) - 691 / (360360 * z * z2 ** 5) + 1 / (156 * z * z2 ** 6);
  return (z - 0.5) * Math.log(z) - z + 0.5 * Math.log(2 * Math.PI) + series - shift;
}
