import type { Piece } from './types';

// Wolfram Rule 30 Cellular Automaton PRNG
export class Rule30PRNG {
  private state: bigint;

  constructor(seed?: number) {
    if (seed === undefined) {
      // Generate a 64-bit random seed to start if none provided
      const high = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
      const low = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
      this.state = (high << 32n) | low;
    } else {
      this.state = BigInt(seed);
    }
    if (this.state === 0n) this.state = 1n; // 0 state stays 0, avoid it
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

// Combat Threshold Logic
export function getOffense(piece: Piece): number {
  return piece.baseOffense + piece.modOffense;
}

export function getDefense(piece: Piece): number {
  return piece.baseDefense + piece.modDefense;
}

// Returns true if attacker can capture defender
export function canCapture(attacker: Piece, defender: Piece): boolean {
  return getOffense(attacker) >= getDefense(defender);
}
