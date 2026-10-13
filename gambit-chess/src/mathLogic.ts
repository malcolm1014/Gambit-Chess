import type { Piece } from './types';

// Roll xdy (e.g. 6d8)
export function rollDice(numDice: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < numDice; i++) {
    total += Math.floor(Math.random() * sides) + 1;
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
