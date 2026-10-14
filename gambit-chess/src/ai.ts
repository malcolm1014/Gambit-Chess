import type { GameState, PlayerColor } from './types';
import { getLegalMoves, isGameOver, TRAP_COST } from './engine';
import { searchBestMove, LEVELS } from './search';
import type { Difficulty, SearchInfo, SearchOptions, EngineMove } from './search';

type Pos = { row: number; col: number };

export interface ComputerTurn {
  trap: Pos | null;        // optional Pitfall placed before moving
  move: EngineMove | null;
  info: SearchInfo | null;
}

// Pitfall heuristic: put a trap where the opponent's pieces are most likely to step,
// weighted by the value of the piece that would be lost (Kings are immune, so they count for nothing).
export function chooseTrapSquare(state: GameState, chance = 0.35): Pos | null {
  const me: PlayerColor = state.turn;
  if (state.players[me].gp < TRAP_COST || Math.random() > chance) return null;
  const them: PlayerColor = me === 'white' ? 'black' : 'white';
  const value: Record<string, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 }; // Kings are immune to traps
  // Opponent's moves, as if it were their turn (traps are hidden from them anyway)
  const theirMoves = getLegalMoves({ ...state, turn: them }, them);
  const myRows = me === 'white' ? [4, 5, 6, 7] : [0, 1, 2, 3];
  const weight = new Map<string, number>();
  for (const m of theirMoves) {
    const sq = state.board[m.to.row][m.to.col];
    if (!myRows.includes(m.to.row) || sq.piece || sq.trap) continue;
    const p = state.board[m.from.row][m.from.col].piece!;
    const k = `${m.to.row},${m.to.col}`;
    weight.set(k, (weight.get(k) ?? 0) + value[p.type]);
  }
  let best: Pos | null = null, bestW = 3; // only worth the GP if it threatens something real
  for (const [k, w] of weight) {
    if (w > bestW) { bestW = w; const [r, c] = k.split(',').map(Number); best = { row: r, col: c }; }
  }
  return best;
}

// Synchronous engine move (used by the 100-game simulation and as a fallback)
export function getComputerMove(state: GameState, opts: SearchOptions = { timeMs: 60 }): { from: Pos; to: Pos; sprint?: boolean } | null {
  if (isGameOver(state)) return null;
  const r = searchBestMove(state, opts);
  return r.move;
}

export function planComputerTurn(state: GameState, level: Difficulty): ComputerTurn {
  if (isGameOver(state)) return { trap: null, move: null, info: null };
  const trap = chooseTrapSquare(state, level === 'squire' ? 0.15 : 0.35);
  let s = state;
  if (trap) {
    // Search with the trap already on the board so the engine accounts for it
    s = structuredClone(state);
    s.board[trap.row][trap.col].trap = { owner: state.turn, hidden: true };
    s.players[state.turn].gp -= TRAP_COST;
  }
  const r = searchBestMove(s, LEVELS[level].opts);
  return { trap, move: r.move, info: r.info };
}
