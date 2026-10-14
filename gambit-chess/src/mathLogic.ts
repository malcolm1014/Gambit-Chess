import type { Piece } from './types';

// Wolfram Rule 30 Cellular Automaton PRNG
export class Rule30PRNG {
  private state: bigint;

  constructor(seed?: number) {
    if (seed === undefined) {
      // Generate a 64-bit random seed to start if none provided
      // (2^32 so every 32-bit value, including 0xFFFFFFFF, is possible)
      const high = BigInt(Math.floor(Math.random() * 2 ** 32));
      const low = BigInt(Math.floor(Math.random() * 2 ** 32));
      this.state = (high << 32n) | low;
    } else {
      this.state = BigInt.asUintN(64, BigInt(seed));
    }
    // Rule 30 has exactly two states that die: all zeros stays zero, and all ones
    // becomes all zeros on the next step. Either would make every roll a 1.
    if (this.state === 0n || this.state === (1n << 64n) - 1n) this.state = 1n;
  }

  private step(): void {
    const MASK = (1n << 64n) - 1n;
    const L = ((this.state >> 1n) | ((this.state & 1n) << 63n)) & MASK;
    const R = ((this.state << 1n) | (this.state >> 63n)) & MASK;
    const C = this.state;
    this.state = (L ^ (C | R)) & MASK;
  }

  // Generates a random 32-bit unsigned integer using the center column of the automaton
  next(): number {
    let result = 0;
    for (let i = 0; i < 32; i++) {
      this.step();
      // Extract bit 31 as the "center" bit
      const centerBit = Number((this.state >> 31n) & 1n);
      result = ((result << 1) | centerBit) >>> 0;
    }
    return result;
  }

  // Returns a float in [0, 1)
  nextFloat(): number {
    return this.next() / 4294967296;
  }
}

export const globalPRNG = new Rule30PRNG();

// Roll xdy (e.g. 6d8) using mathematically accurate Wolfram algorithm
export function rollDice(numDice: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < numDice; i++) {
    total += Math.floor(globalPRNG.nextFloat() * sides) + 1;
  }
  return total;
}

// Roll 6d8 three times and keep the highest sum
export function rollAllocationPool(): number {
  const rolls = [
    rollDice(6, 8),
    rollDice(6, 8),
    rollDice(6, 8)
  ];
  return Math.max(...rolls);
}

// Same as rollAllocationPool, but also returns the three individual 6d8 totals
// so the UI can show the player what was rolled.
export function rollAllocationPoolDetailed(): { rolls: number[]; best: number } {
  const rolls = [rollDice(6, 8), rollDice(6, 8), rollDice(6, 8)];
  return { rolls, best: Math.max(...rolls) };
}

// ---------- Stat arithmetic over the extended reals ----------
// Stats are non-negative whole numbers or +∞ (the King). The rules of the
// extended real line apply: ∞ + n = ∞ for every finite n, and ∞ > n.
// Undefined forms (∞ − ∞) can never occur because no stat is ever negative
// infinity; addStat refuses them rather than silently producing NaN.
export const INFINITE = Number.POSITIVE_INFINITY;

export function addStat(...parts: number[]): number {
  // Validate every part first, so ∞ + (−∞) is rejected rather than absorbed
  for (const p of parts) {
    if (Number.isNaN(p) || p === Number.NEGATIVE_INFINITY) throw new Error(`Invalid stat value: ${p}`);
  }
  let total = 0;
  for (const p of parts) {
    if (p === INFINITE) return INFINITE; // ∞ absorbs every finite addend
    total += p;
  }
  return total;
}

export const isInfinite = (n: number) => n === INFINITE;
export const formatStat = (n: number) => (isInfinite(n) ? '∞' : String(n));

// Combat Threshold Logic
export function getOffense(piece: Piece): number {
  return addStat(piece.baseOffense, piece.modOffense, piece.tempOffense ?? 0);
}

export function getDefense(piece: Piece): number {
  return addStat(piece.baseDefense, piece.modDefense);
}

// The King (Sovereign) can never be captured. This is a rule, not a comparison:
// ∞ ≥ ∞ is not a meaningful contest, so it is decided explicitly here.
export function isUncapturable(piece: Piece): boolean {
  return piece.type === 'king' || isInfinite(getDefense(piece));
}

// Returns true if attacker can capture defender: Offense ≥ Defense on the extended reals
export function canCapture(attacker: Piece, defender: Piece): boolean {
  if (isUncapturable(defender)) return false;
  return getOffense(attacker) >= getDefense(defender);
}
