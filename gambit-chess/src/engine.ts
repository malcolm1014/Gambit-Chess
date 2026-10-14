import type { GameState, Piece, PieceType, PlayerColor, Square } from './types';
import { canCapture } from './mathLogic';
import { isValidChessMove } from './movementLogic';

const PIECE_VALUES: Record<PieceType, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: Infinity // Or a very high number
};

export function createPiece(type: PieceType, color: PlayerColor, id: string): Piece {
  return {
    id,
    type,
    color,
    baseOffense: PIECE_VALUES[type],
    baseDefense: PIECE_VALUES[type],
    modOffense: 0,
    modDefense: 0
  };
}

export function initializeBoard(): Square[][] {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const board: Square[][] = [];

  for (let rank = 8; rank >= 1; rank--) {
    const row: Square[] = [];
    for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
      const file = files[fileIndex];
      let piece: Piece | null = null;

      const color: PlayerColor = rank > 4 ? 'black' : 'white';

      // Pawns
      if (rank === 2 || rank === 7) {
        piece = createPiece('pawn', color, `${color}-pawn-${file}`);
      }
      // Other pieces
      else if (rank === 1 || rank === 8) {
        if (file === 'a' || file === 'h') piece = createPiece('rook', color, `${color}-rook-${file}`);
        else if (file === 'b' || file === 'g') piece = createPiece('knight', color, `${color}-knight-${file}`);
        else if (file === 'c' || file === 'f') piece = createPiece('bishop', color, `${color}-bishop-${file}`);
        else if (file === 'd') piece = createPiece('queen', color, `${color}-queen`);
        else if (file === 'e') piece = createPiece('king', color, `${color}-king`);
      }

      row.push({
        id: `${file}${rank}`,
        file,
        rank,
        piece,
        trap: null
      });
    }
    board.push(row);
  }
  return board;
}

export function createInitialState(whiteDicePool: number, blackDicePool: number): GameState {
  return {
    board: initializeBoard(),
    turn: 'white',
    phase: 'allocation',
    players: {
      white: {
        color: 'white',
        gp: 10,
        dicePool: whiteDicePool,
        allocationReady: false
      },
      black: {
        color: 'black',
        gp: 0,
        dicePool: blackDicePool,
        allocationReady: false
      }
    },
    history: []
  };
}

export function placeTrap(state: GameState, at: {row: number, col: number}, owner: PlayerColor): GameState {
  const newState: GameState = JSON.parse(JSON.stringify(state));
  const square = newState.board[at.row][at.col];

  if (square.trap) {
    throw new Error("There is already a trap here.");
  }

  square.trap = {
    owner,
    hidden: true
  };

  // placing a trap costs 4 GP
  if (newState.players[owner].gp < 4) {
    throw new Error("Not enough GP to place a trap.");
  }
  newState.players[owner].gp -= 4;

  newState.history.push(`${owner} placed a hidden trap.`);

  return newState;
}

// Executes a move (without full standard chess validation for now, assuming valid move)
export function executeMove(state: GameState, from: {row: number, col: number}, to: {row: number, col: number}): GameState {
  // Deep copy state for immutability
  const newState: GameState = JSON.parse(JSON.stringify(state));

  const sourceSquare = newState.board[from.row][from.col];
  const targetSquare = newState.board[to.row][to.col];
  const movingPiece = sourceSquare.piece;

  if (!movingPiece || movingPiece.color !== newState.turn) {
    throw new Error("Invalid piece or not your turn.");
  }

  const targetPiece = targetSquare.piece;
  const isCapture = !!targetPiece;

  if (!isValidChessMove(newState.board, movingPiece, from, to, isCapture)) {
    throw new Error(`Invalid move for ${movingPiece.type}.`);
  }

  if (targetPiece) {
    if (targetPiece.color === movingPiece.color) {
      throw new Error("Cannot capture your own piece.");
    }
    if (!canCapture(movingPiece, targetPiece)) {
      throw new Error(`Combat Threshold failed: Offense (${movingPiece.baseOffense + movingPiece.modOffense}) < Defense (${targetPiece.baseDefense + targetPiece.modDefense})`);
    }
    // Award GP to the losing player
    newState.players[targetPiece.color].gp += targetPiece.baseDefense;
    newState.history.push(`${movingPiece.id} captured ${targetPiece.id}. ${targetPiece.color} gained ${targetPiece.baseDefense} GP.`);
  } else {
    newState.history.push(`${movingPiece.id} moved to ${targetSquare.id}.`);
  }

  // Move the piece
  targetSquare.piece = movingPiece;
  sourceSquare.piece = null;

  // Trap Mechanics
  if (targetSquare.trap) {
    if (targetSquare.trap.owner !== movingPiece.color) {
      // Enemy steps on trap -> destroy piece and trap
      newState.history.push(`${movingPiece.id} stepped on a hidden trap! The piece is destroyed.`);
      targetSquare.piece = null;
      targetSquare.trap = null;
    } else {
      // Own trap, do nothing or allow passage
      // We leave the trap there or let the piece stand on it
    }
  }

  // Switch turn
  newState.turn = newState.turn === 'white' ? 'black' : 'white';

  return newState;
}
