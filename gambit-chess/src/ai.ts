import type { GameState } from './types';
import { executeMove } from './engine';
import { isValidChessMove } from './movementLogic';

export function getComputerMove(state: GameState): { from: { row: number, col: number }, to: { row: number, col: number } } | null {
  const currentPlayer = state.turn;
  const pieces: { row: number, col: number }[] = [];

  // Find all pieces for the current player
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (state.board[r][c].piece?.color === currentPlayer) {
        pieces.push({ row: r, col: c });
      }
    }
  }

  // Generate all pseudo-legal moves for the player
  const possibleMoves: { from: { row: number, col: number }, to: { row: number, col: number } }[] = [];
  for (const from of pieces) {
    const movingPiece = state.board[from.row][from.col].piece!;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const targetPiece = state.board[r][c].piece;
        // Don't try moving to same spot or own piece
        if (r === from.row && c === from.col) continue;
        if (targetPiece?.color === currentPlayer) continue;

        const to = { row: r, col: c };
        const isCapture = !!targetPiece;

        if (isValidChessMove(state.board, movingPiece, from, to, isCapture)) {
           possibleMoves.push({ from, to });
        }
      }
    }
  }

  // Shuffle and try until we find a legally executable move (passes combat threshold)
  possibleMoves.sort(() => Math.random() - 0.5);

  for (const move of possibleMoves) {
    try {
      // Just check if it's executable without throwing
      executeMove(state, move.from, move.to);
      return move;
    } catch (e) {
      // Expected if Combat Threshold failed or other execution error
    }
  }

  return null;
}
