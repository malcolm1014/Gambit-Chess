import type { GameState, Piece, PieceType, PlayerColor, Square } from './types';
import { canCapture, getOffense, getDefense } from './mathLogic';
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
    history: [],
    status: 'playing',
    winner: null,
    inCheck: null,
    movesSinceCapture: 0
  };
}

// Deep copy that keeps Infinity intact. (JSON.parse(JSON.stringify(...)) turns
// Infinity into null, which silently dropped the King's stats to 0 after move 1.)
function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

type Pos = { row: number, col: number };
const opponent = (c: PlayerColor): PlayerColor => (c === 'white' ? 'black' : 'white');

// Draw if this many plies (half-moves) pass with no capture — like chess's 50-move rule
export const DRAW_PLIES_WITHOUT_CAPTURE = 100;

export function isGameOver(state: GameState): boolean {
  return !!state.status && state.status !== 'playing';
}

function findKing(board: Square[][], color: PlayerColor): Pos | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c].piece;
      if (p && p.type === 'king' && p.color === color) return { row: r, col: c };
    }
  }
  return null;
}

// True if any piece of `byColor` could move onto (row, col) by chess movement rules.
// The King's Defense is infinite, so "check" is based on movement alone.
function isSquareAttacked(board: Square[][], target: Pos, byColor: PlayerColor): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c].piece;
      if (p && p.color === byColor && isValidChessMove(board, p, { row: r, col: c }, target, true)) {
        return true;
      }
    }
  }
  return false;
}

export function isInCheck(board: Square[][], color: PlayerColor): boolean {
  const king = findKing(board, color);
  if (!king) return false;
  return isSquareAttacked(board, king, opponent(color));
}

// Checks movement, ownership and the Combat Threshold. Returns an error message, or null if OK.
function pseudoMoveError(board: Square[][], color: PlayerColor, from: Pos, to: Pos, sprint = false): string | null {
  const movingPiece = board[from.row][from.col].piece;
  if (!movingPiece || movingPiece.color !== color) return 'Invalid piece or not your turn.';
  const targetPiece = board[to.row][to.col].piece;
  if (targetPiece && targetPiece.color === movingPiece.color) return 'Cannot capture your own piece.';
  if (sprint) {
    // Sprint card: a Pawn moves exactly 2 squares straight forward onto empty squares
    const forward = movingPiece.color === 'white' ? -1 : 1;
    if (movingPiece.type !== 'pawn') return 'Sprint can only be used on a Pawn.';
    if (to.col !== from.col || to.row !== from.row + 2 * forward) return 'Sprint moves a Pawn exactly 2 squares forward.';
    if (board[from.row + forward][from.col].piece || targetPiece) return 'Sprint needs both squares in front of the Pawn to be empty.';
    return null;
  }
  if (!isValidChessMove(board, movingPiece, from, to, !!targetPiece)) return `Invalid move for ${movingPiece.type}.`;
  if (targetPiece && !canCapture(movingPiece, targetPiece)) {
    const off = getOffense(movingPiece), def = getDefense(targetPiece);
    return `Combat Threshold failed: Offense (${off}) < Defense (${def === Infinity ? '∞' : def})`;
  }
  return null;
}

// Would this move leave the mover's own King in check?
function leavesKingInCheck(board: Square[][], color: PlayerColor, from: Pos, to: Pos): boolean {
  const b = board.map(row => row.map(sq => ({ ...sq })));
  b[to.row][to.col].piece = b[from.row][from.col].piece;
  b[from.row][from.col].piece = null;
  return isInCheck(b, color);
}

// Every fully legal move for `color` (movement + Combat Threshold + King safety).
export function getLegalMoves(state: GameState, color: PlayerColor = state.turn): { from: Pos, to: Pos }[] {
  const moves: { from: Pos, to: Pos }[] = [];
  const board = state.board;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c].piece?.color !== color) continue;
      const from = { row: r, col: c };
      for (let tr = 0; tr < 8; tr++) {
        for (let tc = 0; tc < 8; tc++) {
          const to = { row: tr, col: tc };
          if (pseudoMoveError(board, color, from, to)) continue;
          if (leavesKingInCheck(board, color, from, to)) continue;
          moves.push({ from, to });
        }
      }
    }
  }
  return moves;
}

export function placeTrap(state: GameState, at: {row: number, col: number}, owner: PlayerColor): GameState {
  if (isGameOver(state)) throw new Error('The game is over. Start a new game.');
  const newState: GameState = cloneState(state);
  const square = newState.board[at.row][at.col];

  if (square.trap) {
    throw new Error("There is already a trap here.");
  }
  if (square.piece) {
    throw new Error("Traps can only be placed on empty squares.");
  }

  // placing a trap costs 4 GP
  if (newState.players[owner].gp < 4) {
    throw new Error("Not enough GP to place a trap.");
  }

  square.trap = {
    owner,
    hidden: true
  };
  newState.players[owner].gp -= 4;

  newState.history.push(`${owner} placed a hidden trap.`);

  return newState;
}

// Rally card (2 GP): one of your pieces gets +2 Offense until the end of your turn.
export const RALLY_COST = 2;
export const SPRINT_COST = 3;

export function playRally(state: GameState, at: Pos): GameState {
  if (isGameOver(state)) throw new Error('The game is over. Start a new game.');
  const newState = cloneState(state);
  const me = newState.turn;
  const piece = newState.board[at.row][at.col].piece;
  if (!piece || piece.color !== me) throw new Error('Rally: choose one of your own pieces.');
  if (newState.players[me].gp < RALLY_COST) throw new Error('Not enough GP to play Rally.');
  if (piece.tempOffense) throw new Error('That piece is already rallied this turn.');
  piece.tempOffense = 2;
  newState.players[me].gp -= RALLY_COST;
  newState.history.push(`${me} played Rally: ${piece.id} gets +2 Offense this turn.`);
  return newState;
}

export function executeMove(
  state: GameState,
  from: {row: number, col: number},
  to: {row: number, col: number},
  opts: { sprint?: boolean } = {}
): GameState {
  if (isGameOver(state)) throw new Error('The game is over. Start a new game.');

  // Deep copy state for immutability
  const newState: GameState = cloneState(state);
  const mover = newState.turn;

  const err = pseudoMoveError(newState.board, mover, from, to, !!opts.sprint);
  if (err) throw new Error(err);
  if (opts.sprint && newState.players[mover].gp < SPRINT_COST) throw new Error('Not enough GP to play Sprint.');
  if (leavesKingInCheck(newState.board, mover, from, to)) {
    throw new Error(isInCheck(newState.board, mover)
      ? 'Your King is in check — you must get it out of check.'
      : 'That move would put your own King in check.');
  }

  const sourceSquare = newState.board[from.row][from.col];
  const targetSquare = newState.board[to.row][to.col];
  const movingPiece = sourceSquare.piece!;
  const targetPiece = targetSquare.piece;

  if (targetPiece) {
    // Award GP to the losing player
    newState.players[targetPiece.color].gp += targetPiece.baseDefense;
    newState.history.push(`${movingPiece.id} captured ${targetPiece.id}. ${targetPiece.color} gained ${targetPiece.baseDefense} GP.`);
    newState.movesSinceCapture = 0;
  } else {
    newState.history.push(`${movingPiece.id} moved to ${targetSquare.id}.`);
    newState.movesSinceCapture = (newState.movesSinceCapture ?? 0) + 1;
  }

  if (opts.sprint) {
    newState.players[mover].gp -= SPRINT_COST;
    newState.history.push(`${mover} played Sprint.`);
  }

  // Move the piece
  targetSquare.piece = movingPiece;
  sourceSquare.piece = null;

  // Rally bonuses last only for the turn they were played in
  for (const row of newState.board) for (const sq of row) {
    if (sq.piece && sq.piece.color === mover && sq.piece.tempOffense) delete sq.piece.tempOffense;
  }

  // Pawn promotion: a pawn reaching the far rank becomes a Queen (keeps its allocated modifiers)
  if (movingPiece.type === 'pawn' && (targetSquare.rank === 8 || targetSquare.rank === 1)) {
    movingPiece.type = 'queen';
    movingPiece.baseOffense = PIECE_VALUES.queen;
    movingPiece.baseDefense = PIECE_VALUES.queen;
    newState.history.push(`${movingPiece.id} was promoted to a Queen!`);
  }

  // Trap Mechanics
  if (targetSquare.trap && targetSquare.trap.owner !== movingPiece.color) {
    // Enemy steps on trap -> destroy piece and trap
    newState.history.push(`${movingPiece.id} stepped on a hidden trap! The piece is destroyed.`);
    targetSquare.piece = null;
    targetSquare.trap = null;
    newState.movesSinceCapture = 0;
    if (movingPiece.type === 'king') {
      newState.status = 'king-destroyed';
      newState.winner = opponent(mover);
      newState.inCheck = null;
      newState.history.push(`${mover}'s King was destroyed by a trap. ${opponent(mover)} wins!`);
      return newState;
    }
  }

  // Switch turn
  newState.turn = opponent(mover);

  // Check, checkmate, stalemate, draw
  const nextColor = newState.turn;
  const inCheck = isInCheck(newState.board, nextColor);
  newState.inCheck = inCheck ? nextColor : null;
  const replies = getLegalMoves(newState, nextColor);
  if (replies.length === 0) {
    if (inCheck) {
      newState.status = 'checkmate';
      newState.winner = mover;
      newState.history.push(`Checkmate! ${mover} wins.`);
    } else {
      newState.status = 'stalemate';
      newState.winner = null;
      newState.history.push(`Stalemate — ${nextColor} has no legal moves. The game is a draw.`);
    }
  } else if ((newState.movesSinceCapture ?? 0) >= DRAW_PLIES_WITHOUT_CAPTURE) {
    newState.status = 'draw';
    newState.winner = null;
    newState.history.push(`Draw — ${DRAW_PLIES_WITHOUT_CAPTURE / 2} moves each with no capture.`);
  } else if (inCheck) {
    newState.history.push(`${nextColor} is in check!`);
  }

  return newState;
}
