import type { GameState } from './types';
import { getLegalMoves, isGameOver } from './engine';

type Move = { from: { row: number, col: number }, to: { row: number, col: number } };

// Picks a fully legal move for the side to move (respects the Combat Threshold
// and King safety). Prefers capturing the most valuable piece it can; otherwise random.
export function getComputerMove(state: GameState): Move | null {
  if (isGameOver(state)) return null;
  const moves = getLegalMoves(state, state.turn);
  if (moves.length === 0) return null;

  const captures = moves
    .filter(m => state.board[m.to.row][m.to.col].piece)
    .sort((a, b) =>
      state.board[b.to.row][b.to.col].piece!.baseDefense - state.board[a.to.row][a.to.col].piece!.baseDefense
    );

  // Take the best capture most of the time, so the AI isn't completely aimless
  if (captures.length > 0 && Math.random() < 0.8) return captures[0];

  // Don't wander the King around (it can walk into hidden traps) unless it has to
  const nonKing = moves.filter(m => state.board[m.from.row][m.from.col].piece!.type !== 'king');
  const pool = nonKing.length > 0 ? nonKing : moves;
  return pool[Math.floor(Math.random() * pool.length)];
}
