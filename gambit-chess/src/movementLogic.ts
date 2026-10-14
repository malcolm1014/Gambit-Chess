import type { Piece, Square } from './types';

export function isPathClear(board: Square[][], from: {row: number, col: number}, to: {row: number, col: number}): boolean {
  const rDiff = to.row - from.row;
  const cDiff = to.col - from.col;

  // Knight has no clear path requirement (it jumps)
  // We handle that in the specific piece logic

  const rStep = rDiff === 0 ? 0 : rDiff / Math.abs(rDiff);
  const cStep = cDiff === 0 ? 0 : cDiff / Math.abs(cDiff);

  let currR = from.row + rStep;
  let currC = from.col + cStep;

  while (currR !== to.row || currC !== to.col) {
    if (board[currR][currC].piece) {
      return false; // Path blocked
    }
    currR += rStep;
    currC += cStep;
  }

  return true;
}

export function isValidChessMove(board: Square[][], movingPiece: Piece, from: {row: number, col: number}, to: {row: number, col: number}, isCapture: boolean): boolean {
  const rDiff = to.row - from.row;
  const cDiff = to.col - from.col;
  const absRDiff = Math.abs(rDiff);
  const absCDiff = Math.abs(cDiff);

  if (absRDiff === 0 && absCDiff === 0) return false;

  switch (movingPiece.type) {
    case 'pawn': {
      // Very simplified pawn logic (ignores initial 2-step for now, just basic 1 step forward)
      const forward = movingPiece.color === 'white' ? -1 : 1;

      if (!isCapture) {
        if (cDiff === 0 && rDiff === forward) {
            return isPathClear(board, from, to);
        }
      } else {
        if (absCDiff === 1 && rDiff === forward) {
            return true;
        }
      }
      return false;
    }
    case 'rook':
      if (absRDiff === 0 || absCDiff === 0) {
        return isPathClear(board, from, to);
      }
      return false;
    case 'bishop':
      if (absRDiff === absCDiff) {
        return isPathClear(board, from, to);
      }
      return false;
    case 'queen':
      if (absRDiff === 0 || absCDiff === 0 || absRDiff === absCDiff) {
        return isPathClear(board, from, to);
      }
      return false;
    case 'knight':
      if ((absRDiff === 2 && absCDiff === 1) || (absRDiff === 1 && absCDiff === 2)) {
        return true; // Knights jump, path doesn't matter
      }
      return false;
    case 'king':
      if (absRDiff <= 1 && absCDiff <= 1) {
        return true; // Simplified, no castling logic for now
      }
      return false;
    default:
      return false;
  }
}
