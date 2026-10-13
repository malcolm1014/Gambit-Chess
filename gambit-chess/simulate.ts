import { createInitialState, executeMove } from './src/engine';
import { rollAllocationPool } from './src/mathLogic';
import { isValidChessMove } from './src/movementLogic';

function getRandomInt(max: number) {
  return Math.floor(Math.random() * max);
}

function simulateGame(gameIndex: number) {
  let state = createInitialState(rollAllocationPool(), rollAllocationPool());
  // console.log(`Starting Game ${gameIndex + 1}`);

  for (let turn = 0; turn < 200; turn++) { // Play up to 200 moves deep
    const currentPlayer = state.turn;
    const pieces: {row: number, col: number}[] = [];

    // Find all pieces
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (state.board[r][c].piece?.color === currentPlayer) {
          pieces.push({row: r, col: c});
        }
      }
    }

    if (pieces.length === 0) {
      console.log(`Game ${gameIndex + 1} over. No pieces left for ${currentPlayer}. Moves: ${state.history.length}`);
      break;
    }

    // Generate all pseudo-legal moves for the player
    const possibleMoves: {from: {row: number, col: number}, to: {row: number, col: number}}[] = [];
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

    if (possibleMoves.length === 0) {
      console.log(`Game ${gameIndex + 1} ended (Stalemate / No valid moves for ${currentPlayer}). Moves: ${state.history.length}`);
      break;
    }

    // Shuffle and try until we find a legally executable move (passes combat threshold)
    possibleMoves.sort(() => Math.random() - 0.5);

    let moved = false;
    for (const move of possibleMoves) {
      try {
        state = executeMove(state, move.from, move.to);
        moved = true;
        break; // Stop after first successful move
      } catch (e) {
        // Expected if Combat Threshold failed
      }
    }

    if (!moved) {
       console.log(`Game ${gameIndex + 1} ended. All pseudo-legal moves failed combat threshold for ${currentPlayer}. Moves: ${state.history.length}`);
       break;
    }
  }
}

for (let i = 0; i < 50; i++) {
  try {
    simulateGame(i);
  } catch (e) {
    console.error(`\nCRASH in Game ${i + 1}:`, e);
    // Print stack trace for debugging
    throw e;
  }
}
console.log("Completed 50 simulation games.");
