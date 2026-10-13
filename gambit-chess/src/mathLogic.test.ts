import { describe, it, expect } from 'vitest';
import { rollDice, rollAllocationPool, getOffense, getDefense, canCapture } from './mathLogic';
import { createPiece } from './engine';

describe('mathLogic', () => {
  it('rollDice should return a number within the expected range', () => {
    for (let i = 0; i < 100; i++) {
      const result = rollDice(6, 8);
      expect(result).toBeGreaterThanOrEqual(6);
      expect(result).toBeLessThanOrEqual(48);
    }
  });

  it('rollAllocationPool should return the highest of three 6d8 rolls', () => {
    for (let i = 0; i < 20; i++) {
      const result = rollAllocationPool();
      expect(result).toBeGreaterThanOrEqual(6);
      expect(result).toBeLessThanOrEqual(48);
    }
  });

  it('getOffense should return base + mod', () => {
    const piece = createPiece('pawn', 'white', 'p1');
    expect(piece.baseOffense).toBe(1);
    piece.modOffense = 2;
    expect(getOffense(piece)).toBe(3);
  });

  it('getDefense should return base + mod', () => {
    const piece = createPiece('knight', 'black', 'n1');
    expect(piece.baseDefense).toBe(3);
    piece.modDefense = 4;
    expect(getDefense(piece)).toBe(7);
  });

  it('canCapture should be true when offense >= defense', () => {
    const attacker = createPiece('queen', 'white', 'q1'); // base 9
    const defender = createPiece('rook', 'black', 'r1');  // base 5
    expect(canCapture(attacker, defender)).toBe(true);

    defender.modDefense = 5; // total defense 10
    expect(canCapture(attacker, defender)).toBe(false);

    attacker.modOffense = 1; // total offense 10
    expect(canCapture(attacker, defender)).toBe(true);
  });
});
