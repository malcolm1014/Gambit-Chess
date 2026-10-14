export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type PlayerColor = 'white' | 'black';

export interface Piece {
  id: string; // Unique identifier (e.g. 'white-pawn-1')
  type: PieceType;
  color: PlayerColor;
  baseOffense: number;
  baseDefense: number;
  modOffense: number; // Allocated from 6d8
  modDefense: number; // Allocated from 6d8
  tempOffense?: number; // Short-lived bonus (e.g. Rally card), cleared after the owner's move
}

export interface Trap {
  owner: PlayerColor;
  hidden: boolean;
  // Further trap mechanics could be added here
}

export interface Square {
  id: string; // e.g. 'a1', 'h8'
  file: string; // 'a'-'h'
  rank: number; // 1-8
  piece: Piece | null;
  trap: Trap | null;
}

export interface PlayerState {
  color: PlayerColor;
  gp: number; // Gambit Points
  dicePool: number; // The sum from 6d8 roll
  allocationReady: boolean; // Whether they've finished allocation
}

export interface GameState {
  board: Square[][]; // 8x8 grid
  turn: PlayerColor;
  phase: 'allocation' | 'main';
  players: {
    white: PlayerState;
    black: PlayerState;
  };
  history: string[]; // Keep track of moves or events
  // Game result tracking (optional so older code that builds states still works)
  status?: 'playing' | 'checkmate' | 'stalemate' | 'king-destroyed' | 'draw';
  winner?: PlayerColor | null;
  inCheck?: PlayerColor | null; // Which side's king is currently in check
  movesSinceCapture?: number;   // Plies since the last capture (for the draw rule)
}
