import { createInitialState, executeMove } from './src/engine';
import { rollAllocationPool } from './src/mathLogic';

function getRandomInt(max: number) {
  return Math.floor(Math.random() * max);
}

function simulateGame(gameIndex: number) {
  let state = createInitialState(rollAllocationPool(), rollAllocationPool());
  console.log(`Starting Game ${gameIndex + 1}`);

  for (let turn = 0; turn < 50; turn++) {
    // Find all pieces belonging to current player
    const currentPlayer = state.turn;
    const pieces: {row: number, col: number}[] = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (state.board[r][c].piece?.color === currentPlayer) {
          pieces.push({row: r, col: c});
        }
      }
    }

    if (pieces.length === 0) {
      console.log(`Game over. No pieces left for ${currentPlayer}.`);
      break;
    }

    let moved = false;
    // Try to find a valid move
    // We try random pieces and random destinations
    let attempts = 0;
    while (!moved && attempts < 100) {
      const from = pieces[getRandomInt(pieces.length)];
      const to = { row: getRandomInt(8), col: getRandomInt(8) };

      try {
        state = executeMove(state, from, to);
        moved = true;
      } catch (e) {
        // Expected to fail sometimes (combat threshold, same color)
      }
      attempts++;
    }

    if (!moved) {
      // Could not find valid move
      console.log(`No valid moves found for ${currentPlayer}.`);
      break;
    }
  }
  console.log(`Finished Game ${gameIndex + 1} with ${state.history.length} moves.`);
}

for (let i = 0; i < 10; i++) {
  try {
    simulateGame(i);
  } catch (e) {
    console.error(`Game ${i + 1} crashed:`, e);
  }
}
