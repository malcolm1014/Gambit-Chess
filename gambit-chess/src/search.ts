/*
 * Gambit Chess search engine
 * ---------------------------
 * A from-scratch implementation of the classic techniques used by strong
 * open-source chess engines (Stockfish, Fruit, Crafty, CPW-Engine), adapted to
 * Gambit Chess's own rules: per-piece Offense/Defense with the Combat
 * Threshold, an uncapturable King (Defense = infinity), hidden traps, Gambit
 * Points and the Sprint card.
 *
 * Techniques:
 *   - Mailbox board with typed arrays and make/unmake (no copying per node)
 *   - Zobrist hashing (two 32-bit halves) + transposition table
 *   - Negamax alpha-beta with Principal Variation Search (PVS)
 *   - Iterative deepening with aspiration windows and a time limit
 *   - Quiescence search on captures/promotions with stand-pat and delta pruning
 *   - Null-move pruning (R = 2..3), Late Move Reductions (logarithmic table)
 *   - Check extensions, mate-distance scoring, repetition detection
 *   - Move ordering: TT move, MVV-LVA captures, 2 killer moves, history heuristic
 *   - Tapered evaluation (middlegame/endgame) with piece-square tables,
 *     mobility, pawn structure, king safety and Gambit-specific terms
 *     (stat bonuses, "untouchable" pieces, Gambit Points)
 *
 * Fair play: the engine only knows about traps its own side placed. It never
 * sees the opponent's hidden traps.
 */

import type { GameState, PlayerColor } from './types';

// ---------- Piece codes ----------
// Positive = white, negative = black. 7 = a Queen that was promoted from a Pawn
// (it keeps the Pawn's allocated modifiers, so it gets its own hash code).
export const EMPTY = 0, P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6, PQ = 7;
const BASE_VALUE = [0, 1, 3, 3, 5, 9, 0, 9];           // chess value (GP, capture ordering)
// Role-based built-in stats (must match PIECE_ROLES in engine.ts)
const ROLE_O = [0, 2, 4, 3, 5, 9, 0, 9];
const ROLE_D = [0, 1, 3, 4, 6, 7, 0, 7];
const TYPE_NAME = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king', 'queen'];

export const MATE = 100000;
const MATE_BOUND = MATE - 1000;
const INF = 1_000_000;

// ---------- Deterministic PRNG for Zobrist keys (xorshift32) ----------
let seed = 0x9e3779b9;
const rnd32 = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
// [code+7][square] -> key halves ; codes -7..7
const ZK_LO = new Uint32Array(15 * 64), ZK_HI = new Uint32Array(15 * 64);
for (let i = 0; i < 15 * 64; i++) { ZK_LO[i] = rnd32(); ZK_HI[i] = rnd32(); }
const ZT_LO = new Uint32Array(3 * 64), ZT_HI = new Uint32Array(3 * 64); // trap owner (-1,0,1)+1
for (let i = 0; i < 3 * 64; i++) { ZT_LO[i] = rnd32(); ZT_HI[i] = rnd32(); }
const Z_SIDE_LO = rnd32(), Z_SIDE_HI = rnd32();
const Z_GP_LO = new Uint32Array(2 * 64), Z_GP_HI = new Uint32Array(2 * 64); // gp buckets (capped)
for (let i = 0; i < 2 * 64; i++) { Z_GP_LO[i] = rnd32(); Z_GP_HI[i] = rnd32(); }

// ---------- Geometry ----------
const KNIGHT_D = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_D = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_D = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const QUEEN_D = [...ROOK_D, ...BISHOP_D];
const onBoard = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

// Precomputed target lists
const KNIGHT_T: number[][] = [], KING_T: number[][] = [];
for (let s = 0; s < 64; s++) {
  const r = s >> 3, c = s & 7;
  KNIGHT_T[s] = KNIGHT_D.filter(([dr, dc]) => onBoard(r + dr, c + dc)).map(([dr, dc]) => (r + dr) * 8 + c + dc);
  KING_T[s] = KING_D.filter(([dr, dc]) => onBoard(r + dr, c + dc)).map(([dr, dc]) => (r + dr) * 8 + c + dc);
}

// ---------- Piece-square tables (centipawns, from White's view, row 0 = rank 8) ----------
// Original tables written for this engine. Pawns only move one square in Gambit
// Chess, so advanced pawns are rewarded more strongly than in standard chess.
const PST_MG: number[][] = [];
const PST_EG: number[][] = [];
PST_MG[P] = [
   0,  0,  0,  0,  0,  0,  0,  0,
  90, 95,100,105,105,100, 95, 90,
  40, 45, 55, 65, 65, 55, 45, 40,
  15, 20, 30, 45, 45, 30, 20, 15,
   5, 10, 20, 35, 35, 20, 10,  5,
   0,  5, 10, 20, 20, 10,  5,  0,
   0,  0,  0,-10,-10,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0];
PST_EG[P] = [
   0,  0,  0,  0,  0,  0,  0,  0,
 160,160,160,160,160,160,160,160,
  95, 95, 95, 95, 95, 95, 95, 95,
  55, 55, 55, 55, 55, 55, 55, 55,
  30, 30, 30, 30, 30, 30, 30, 30,
  12, 12, 12, 12, 12, 12, 12, 12,
   0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0];
PST_MG[N] = [
 -50,-35,-25,-20,-20,-25,-35,-50,
 -35,-15,  0,  5,  5,  0,-15,-35,
 -25,  5, 15, 20, 20, 15,  5,-25,
 -20,  5, 20, 28, 28, 20,  5,-20,
 -20,  5, 18, 25, 25, 18,  5,-20,
 -25,  0, 12, 15, 15, 12,  0,-25,
 -35,-15,  0,  5,  5,  0,-15,-35,
 -50,-30,-25,-20,-20,-25,-30,-50];
PST_EG[N] = PST_MG[N].map(v => Math.round(v * 0.8));
PST_MG[B] = [
 -20,-10,-10,-10,-10,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  8, 12, 12,  8,  0,-10,
 -10,  6,  8, 15, 15,  8,  6,-10,
 -10,  0, 12, 15, 15, 12,  0,-10,
 -10, 12, 10, 10, 10, 10, 12,-10,
 -10,  8,  0,  0,  0,  0,  8,-10,
 -20,-10,-15,-10,-10,-15,-10,-20];
PST_EG[B] = PST_MG[B].map(v => Math.round(v * 0.7));
PST_MG[R] = [
   5, 10, 10, 10, 10, 10, 10,  5,
  20, 25, 25, 25, 25, 25, 25, 20,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  5, 10, 10,  5,  0,  0];
PST_EG[R] = PST_MG[R].map(v => Math.round(v * 0.5));
PST_MG[Q] = [
 -20,-10,-10, -5, -5,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  8,  8,  5,  0, -5,
  -5,  0,  5,  8,  8,  5,  0, -5,
 -10,  5,  5,  5,  5,  5,  0,-10,
 -10,  0,  5,  0,  0,  0,  0,-10,
 -20,-10,-10, -5, -5,-10,-10,-20];
PST_EG[Q] = PST_MG[Q].map(v => v + 5);
PST_MG[K] = [
 -40,-45,-45,-50,-50,-45,-45,-40,
 -40,-45,-45,-50,-50,-45,-45,-40,
 -40,-45,-45,-50,-50,-45,-45,-40,
 -35,-40,-40,-45,-45,-40,-40,-35,
 -25,-30,-30,-40,-40,-30,-30,-25,
 -15,-20,-20,-25,-25,-20,-20,-15,
  10, 10, -5,-10,-10, -5, 10, 10,
  15, 25,  5, -5,  0,  5, 25, 15];
PST_EG[K] = [
 -50,-35,-25,-20,-20,-25,-35,-50,
 -30,-15,  0,  5,  5,  0,-15,-30,
 -25,  0, 20, 30, 30, 20,  0,-25,
 -25,  5, 30, 40, 40, 30,  5,-25,
 -25,  5, 30, 40, 40, 30,  5,-25,
 -25,  0, 20, 30, 30, 20,  0,-25,
 -30,-20,  0,  0,  0,  0,-20,-30,
 -50,-35,-25,-20,-20,-25,-35,-50];
PST_MG[PQ] = PST_MG[Q]; PST_EG[PQ] = PST_EG[Q];
const PIECE_CP_MG = [0, 100, 320, 330, 500, 950, 0, 950];
const PIECE_CP_EG = [0, 130, 300, 320, 540, 1000, 0, 1000];
const PHASE_W = [0, 0, 1, 1, 2, 4, 0, 4];
const OFF_POINT_CP = 14; // value of +1 Offense
const DEF_POINT_CP = 16; // value of +1 Defense
const GP_CP = 22;        // value of 1 Gambit Point (a 4 GP trap ~ a pawn)

// Logarithmic LMR table (as popularised by Stockfish / Fruit)
const LMR = Array.from({ length: 64 }, (_, d) => Array.from({ length: 64 }, (_, m) =>
  d === 0 || m === 0 ? 0 : Math.floor(0.5 + Math.log(d) * Math.log(m) / 2.25)));

// ---------- Move encoding ----------
// bits 0-5 from, 6-11 to, bit 12 sprint
const mFrom = (m: number) => m & 63;
const mTo = (m: number) => (m >> 6) & 63;
const mSprint = (m: number) => (m >> 12) & 1;
const mk = (f: number, t: number, sprint = 0) => f | (t << 6) | (sprint << 12);

export interface SearchInfo {
  depth: number;
  seldepth: number;
  nodes: number;
  timeMs: number;
  nps: number;
  scoreCp: number;          // from the side-to-move's point of view
  mateIn: number | null;    // moves to mate (positive = side to move mates)
  pv: string[];             // principal variation in square notation
}

export interface EngineMove {
  from: { row: number; col: number };
  to: { row: number; col: number };
  sprint: boolean;
}

export interface SearchResult { move: EngineMove | null; info: SearchInfo }

export interface SearchOptions {
  timeMs?: number;     // soft time limit
  maxDepth?: number;
  evalNoise?: number;  // centipawns of randomness (for easier levels)
}

// Transposition table entry flags
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;
const TT_BITS = 20, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;

export class Position {
  board = new Int8Array(64);
  off = new Float64Array(64);
  def = new Float64Array(64);
  trap = new Int8Array(64);           // +1 white trap, -1 black trap (only known traps)
  side = 1;                           // +1 white to move, -1 black
  gp = [0, 0];                        // [white, black]
  kingLost = 0;                       // set to +1/-1 if that colour's King hit a trap
  hashLo = 0; hashHi = 0;

  // undo stack
  private stack: number[][] = [];

  static fromGameState(state: GameState, viewer: PlayerColor): Position {
    const p = new Position();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const s = r * 8 + c, sq = state.board[r][c];
      const pc = sq.piece;
      if (pc) {
        let code = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'].indexOf(pc.type);
        // A queen with Pawn-sized modifiers that came from promotion is tracked separately
        if (pc.type === 'queen' && pc.id.includes('pawn')) code = PQ;
        p.board[s] = pc.color === 'white' ? code : -code;
        p.off[s] = pc.baseOffense + pc.modOffense + (pc.tempOffense ?? 0);
        p.def[s] = pc.baseDefense + pc.modDefense;
      }
      // Only traps belonging to the side doing the thinking are visible to it
      if (sq.trap && sq.trap.owner === viewer) p.trap[s] = sq.trap.owner === 'white' ? 1 : -1;
    }
    p.side = state.turn === 'white' ? 1 : -1;
    p.gp = [state.players.white.gp, state.players.black.gp];
    p.computeHash();
    return p;
  }

  computeHash() {
    let lo = 0, hi = 0;
    for (let s = 0; s < 64; s++) {
      if (this.board[s]) { const i = (this.board[s] + 7) * 64 + s; lo ^= ZK_LO[i]; hi ^= ZK_HI[i]; }
      if (this.trap[s]) { const i = (this.trap[s] + 1) * 64 + s; lo ^= ZT_LO[i]; hi ^= ZT_HI[i]; }
    }
    if (this.side === -1) { lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI; }
    for (let c = 0; c < 2; c++) { const g = Math.min(63, this.gp[c]); lo ^= Z_GP_LO[c * 64 + g]; hi ^= Z_GP_HI[c * 64 + g]; }
    this.hashLo = lo >>> 0; this.hashHi = hi >>> 0;
  }

  private xorPiece(code: number, s: number) {
    const i = (code + 7) * 64 + s; this.hashLo = (this.hashLo ^ ZK_LO[i]) >>> 0; this.hashHi = (this.hashHi ^ ZK_HI[i]) >>> 0;
  }
  private xorTrap(owner: number, s: number) {
    const i = (owner + 1) * 64 + s; this.hashLo = (this.hashLo ^ ZT_LO[i]) >>> 0; this.hashHi = (this.hashHi ^ ZT_HI[i]) >>> 0;
  }
  private setGp(ci: number, v: number) {
    const a = ci * 64 + Math.min(63, this.gp[ci]), b = ci * 64 + Math.min(63, v);
    this.hashLo = (this.hashLo ^ Z_GP_LO[a] ^ Z_GP_LO[b]) >>> 0; this.hashHi = (this.hashHi ^ Z_GP_HI[a] ^ Z_GP_HI[b]) >>> 0;
    this.gp[ci] = v;
  }

  kingSquare(color: number): number {
    const k = K * color;
    for (let s = 0; s < 64; s++) if (this.board[s] === k) return s;
    return -1;
  }

  // Is square s attacked (by movement geometry) by any piece of `by` (+1/-1)?
  attacked(s: number, by: number): boolean {
    const b = this.board, r = s >> 3, c = s & 7;
    // pawns: a white pawn attacks diagonally "up" (row-1), so it sits at row+1
    const pr = r + (by === 1 ? 1 : -1);
    if (pr >= 0 && pr < 8) {
      if (c > 0 && b[pr * 8 + c - 1] === P * by) return true;
      if (c < 7 && b[pr * 8 + c + 1] === P * by) return true;
    }
    for (const t of KNIGHT_T[s]) if (b[t] === N * by) return true;
    for (const t of KING_T[s]) if (b[t] === K * by) return true;
    for (const [dr, dc] of ROOK_D) {
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        const x = b[rr * 8 + cc];
        if (x) { if (x === R * by || x === Q * by || x === PQ * by) return true; break; }
        rr += dr; cc += dc;
      }
    }
    for (const [dr, dc] of BISHOP_D) {
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        const x = b[rr * 8 + cc];
        if (x) { if (x === B * by || x === Q * by || x === PQ * by) return true; break; }
        rr += dr; cc += dc;
      }
    }
    return false;
  }

  inCheck(color: number): boolean {
    const ks = this.kingSquare(color);
    return ks >= 0 && this.attacked(ks, -color);
  }

  // Pseudo-legal moves (Combat Threshold already enforced). capturesOnly for quiescence.
  generate(moves: number[], capturesOnly = false) {
    const b = this.board, us = this.side;
    for (let s = 0; s < 64; s++) {
      const pc = b[s];
      if (!pc || Math.sign(pc) !== us) continue;
      const t = Math.abs(pc), r = s >> 3, c = s & 7;
      const add = (to: number) => {
        const x = b[to];
        if (x === 0) { if (!capturesOnly) moves.push(mk(s, to)); }
        else if (Math.sign(x) !== us && this.off[s] >= this.def[to]) moves.push(mk(s, to));
      };
      if (t === P) {
        const fr = r - us; // white moves to row-1
        if (fr >= 0 && fr < 8) {
          const fwd = fr * 8 + c;
          const promo = fr === 0 || fr === 7;
          if (b[fwd] === 0 && (!capturesOnly || promo)) moves.push(mk(s, fwd));
          if (c > 0) { const x = b[fwd - 1]; if (x && Math.sign(x) !== us && this.off[s] >= this.def[fwd - 1]) moves.push(mk(s, fwd - 1)); }
          if (c < 7) { const x = b[fwd + 1]; if (x && Math.sign(x) !== us && this.off[s] >= this.def[fwd + 1]) moves.push(mk(s, fwd + 1)); }
          // Sprint card: 2 squares straight ahead, both empty, costs 3 GP
          const fr2 = r - 2 * us;
          if (!capturesOnly && fr2 >= 0 && fr2 < 8 && b[fwd] === 0 && b[fr2 * 8 + c] === 0 && this.gp[us === 1 ? 0 : 1] >= 3) {
            moves.push(mk(s, fr2 * 8 + c, 1));
          }
        }
      } else if (t === N) {
        for (const to of KNIGHT_T[s]) add(to);
      } else if (t === K) {
        for (const to of KING_T[s]) add(to);
      } else {
        const dirs = t === B ? BISHOP_D : t === R ? ROOK_D : QUEEN_D;
        for (const [dr, dc] of dirs) {
          let rr = r + dr, cc = c + dc;
          while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
            const to = rr * 8 + cc;
            add(to);
            if (b[to]) break;
            rr += dr; cc += dc;
          }
        }
      }
    }
  }

  // Make a move. Returns false (and undoes it) if it leaves the mover's King in check.
  make(m: number): boolean {
    const b = this.board, from = mFrom(m), to = mTo(m), us = this.side, ci = us === 1 ? 0 : 1;
    const moved = b[from], captured = b[to];
    const undo = [m, moved, captured, this.off[from], this.def[from], this.off[to], this.def[to],
      this.trap[to], this.gp[0], this.gp[1], this.kingLost, this.hashLo, this.hashHi];
    this.stack.push(undo);

    if (captured) {
      this.xorPiece(captured, to);
      const oi = captured > 0 ? 0 : 1;
      this.setGp(oi, this.gp[oi] + BASE_VALUE[Math.abs(captured)]); // loser gains GP = base value
    }
    if (mSprint(m)) this.setGp(ci, this.gp[ci] - 3);

    this.xorPiece(moved, from);
    let code = moved, off = this.off[from], def = this.def[from];
    const toRow = to >> 3;
    if (Math.abs(moved) === P && (toRow === 0 || toRow === 7)) {
      code = PQ * us; off = off - ROLE_O[P] + ROLE_O[Q]; def = def - ROLE_D[P] + ROLE_D[Q]; // keeps the pawn's modifiers
    }
    b[from] = 0; this.off[from] = 0; this.def[from] = 0;
    b[to] = code; this.off[to] = off; this.def[to] = def;
    this.xorPiece(code, to);

    this.side = -us;
    this.hashLo = (this.hashLo ^ Z_SIDE_LO) >>> 0; this.hashHi = (this.hashHi ^ Z_SIDE_HI) >>> 0;

    // Legality is judged before traps resolve (same rule as the game engine)
    if (this.inCheck(us)) { this.unmake(); return false; }

    // Trap: an enemy piece entering a known trap is destroyed
    const tr = this.trap[to];
    if (tr && tr !== us) {
      this.xorPiece(code, to);
      b[to] = 0; this.off[to] = 0; this.def[to] = 0;
      this.xorTrap(tr, to); this.trap[to] = 0;
      if (Math.abs(code) === K) this.kingLost = us;
    }
    return true;
  }

  unmake() {
    const u = this.stack.pop()!;
    const m = u[0], from = mFrom(m), to = mTo(m);
    this.board[from] = u[1]; this.off[from] = u[3]; this.def[from] = u[4];
    this.board[to] = u[2]; this.off[to] = u[5]; this.def[to] = u[6];
    this.trap[to] = u[7]; this.gp[0] = u[8]; this.gp[1] = u[9]; this.kingLost = u[10];
    this.hashLo = u[11]; this.hashHi = u[12];
    this.side = -this.side;
  }

  makeNull() {
    this.stack.push([-1, this.hashLo, this.hashHi]);
    this.side = -this.side;
    this.hashLo = (this.hashLo ^ Z_SIDE_LO) >>> 0; this.hashHi = (this.hashHi ^ Z_SIDE_HI) >>> 0;
  }
  unmakeNull() {
    const u = this.stack.pop()!;
    this.hashLo = u[1]; this.hashHi = u[2]; this.side = -this.side;
  }

  hasNonPawnMaterial(color: number) {
    for (let s = 0; s < 64; s++) { const x = this.board[s] * color; if (x > 0 && x !== P && x !== K) return true; }
    return false;
  }

  // ---------- Evaluation (centipawns, from side-to-move's view) ----------
  evaluate(): number {
    const b = this.board;
    let mg = 0, eg = 0, phase = 0;
    // Strongest attacker each side has (for the "untouchable" term)
    let maxOffW = 0, maxOffB = 0;
    for (let s = 0; s < 64; s++) {
      if (b[s] > 0 && b[s] !== K) maxOffW = Math.max(maxOffW, this.off[s]);
      if (b[s] < 0 && b[s] !== -K) maxOffB = Math.max(maxOffB, this.off[s]);
    }
    const pawnFiles = [new Int8Array(8), new Int8Array(8)];
    for (let s = 0; s < 64; s++) {
      if (b[s] === P) pawnFiles[0][s & 7]++;
      else if (b[s] === -P) pawnFiles[1][s & 7]++;
    }

    for (let s = 0; s < 64; s++) {
      const pc = b[s];
      if (!pc) continue;
      const col = pc > 0 ? 1 : -1, t = Math.abs(pc);
      const ps = col === 1 ? s : (7 - (s >> 3)) * 8 + (s & 7); // mirror for black
      let vmg = PIECE_CP_MG[t] + PST_MG[t][ps];
      let veg = PIECE_CP_EG[t] + PST_EG[t][ps];
      phase += PHASE_W[t];

      if (t !== K) {
        const base = BASE_VALUE[t];
        // Value of the piece's stats relative to a standard piece of its value
        const bonus = (this.off[s] - base) * OFF_POINT_CP + (this.def[s] - base) * DEF_POINT_CP;
        vmg += bonus; veg += bonus;
        // Untouchable: nothing the enemy owns can ever beat this piece's Defense
        const enemyMax = col === 1 ? maxOffB : maxOffW;
        if (this.def[s] > enemyMax) { vmg += 10 + base * 6; veg += 10 + base * 6; }
      }

      // Mobility for sliders and knights
      if (t === N || t === B || t === R || t === Q || t === PQ) {
        let mob = 0;
        if (t === N) { for (const to of KNIGHT_T[s]) if (Math.sign(b[to]) !== col) mob++; }
        else {
          const dirs = t === B ? BISHOP_D : t === R ? ROOK_D : QUEEN_D;
          const r = s >> 3, c = s & 7;
          for (const [dr, dc] of dirs) {
            let rr = r + dr, cc = c + dc;
            while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
              const x = b[rr * 8 + cc];
              if (Math.sign(x) !== col) mob++;
              if (x) break;
              rr += dr; cc += dc;
            }
          }
        }
        const w = t === N ? 4 : t === B ? 4 : t === R ? 2 : 1;
        vmg += mob * w; veg += mob * (w + 1);
      }

      // Pawn structure
      if (t === P) {
        const f = s & 7, own = pawnFiles[col === 1 ? 0 : 1];
        if (own[f] > 1) { vmg -= 12; veg -= 20; }                        // doubled
        if ((f === 0 || own[f - 1] === 0) && (f === 7 || own[f + 1] === 0)) { vmg -= 10; veg -= 15; } // isolated
        // passed: no enemy pawn ahead on this or adjacent files
        let passed = true;
        const r = s >> 3;
        for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1) && passed; ff++) {
          for (let rr = col === 1 ? r - 1 : r + 1; rr >= 0 && rr < 8; rr += col === 1 ? -1 : 1) {
            if (b[rr * 8 + ff] === -P * col) { passed = false; break; }
          }
        }
        if (passed) { const adv = col === 1 ? 7 - r : r; vmg += adv * 6; veg += adv * adv * 4; }
      }

      // King safety: pawn shield in the middlegame
      if (t === K) {
        const r = s >> 3, c = s & 7, fr = r - col;
        let shield = 0;
        if (fr >= 0 && fr < 8) for (let cc = Math.max(0, c - 1); cc <= Math.min(7, c + 1); cc++) if (b[fr * 8 + cc] === P * col) shield++;
        vmg += shield * 12;
        // enemy pieces close to the king
        let near = 0;
        for (const to of KING_T[s]) if (Math.sign(b[to]) === -col) near++;
        vmg -= near * 15;
      }

      mg += vmg * col; eg += veg * col;
    }

    phase = Math.min(24, phase);
    let score = (mg * phase + eg * (24 - phase)) / 24;
    score += (this.gp[0] - this.gp[1]) * GP_CP;
    score = score * this.side + 10; // tempo
    return Math.round(score);
  }
}

const sqName = (s: number) => 'abcdefgh'[s & 7] + (8 - (s >> 3));

export class Searcher {
  private ttLo = new Uint32Array(TT_SIZE);
  private ttHi = new Uint32Array(TT_SIZE);
  private ttMove = new Int32Array(TT_SIZE);
  private ttScore = new Int32Array(TT_SIZE);
  private ttDepth = new Int8Array(TT_SIZE);
  private ttFlag = new Int8Array(TT_SIZE);
  private killers: Int32Array[] = Array.from({ length: 128 }, () => new Int32Array(2));
  private history = new Int32Array(64 * 64);
  private pathLo: number[] = [];
  private pathHi: number[] = [];

  nodes = 0;
  seldepth = 0;
  private stopAt = 0;
  private stopped = false;
  private noise = 0;
  private pos!: Position;

  search(pos: Position, opts: SearchOptions = {}): SearchResult {
    const timeMs = opts.timeMs ?? 1000;
    const maxDepth = Math.min(opts.maxDepth ?? 64, 64);
    this.noise = opts.evalNoise ?? 0;
    this.pos = pos;
    this.nodes = 0; this.seldepth = 0; this.stopped = false;
    this.history.fill(0);
    for (const k of this.killers) k.fill(0);
    const t0 = Date.now();
    this.stopAt = t0 + timeMs;

    // Root legal moves
    const root: number[] = [];
    const pseudo: number[] = [];
    pos.generate(pseudo);
    for (const m of pseudo) if (pos.make(m)) { pos.unmake(); root.push(m); }
    const info: SearchInfo = { depth: 0, seldepth: 0, nodes: 0, timeMs: 0, nps: 0, scoreCp: 0, mateIn: null, pv: [] };
    if (root.length === 0) return { move: null, info };

    let best = root[0], bestScore = -INF, prevScore = 0;
    for (let depth = 1; depth <= maxDepth; depth++) {
      // Aspiration window around the previous score
      let delta = 35, alpha = -INF, beta = INF;
      if (depth >= 4) { alpha = prevScore - delta; beta = prevScore + delta; }
      let score = 0;
      for (;;) {
        score = this.negamax(depth, alpha, beta, 0, true);
        if (this.stopped) break;
        if (score <= alpha) { alpha = Math.max(-INF, alpha - delta); delta *= 2; }
        else if (score >= beta) { beta = Math.min(INF, beta + delta); delta *= 2; }
        else break;
      }
      if (this.stopped && depth > 1) break;
      const m = this.probeMove(pos);
      if (m && root.includes(m)) best = m;
      bestScore = score; prevScore = score;
      info.depth = depth;
      info.seldepth = this.seldepth;
      info.scoreCp = bestScore;
      info.mateIn = Math.abs(bestScore) >= MATE_BOUND ? Math.sign(bestScore) * Math.ceil((MATE - Math.abs(bestScore)) / 2) : null;
      info.pv = this.extractPv(pos, depth).map(mv => sqName(mFrom(mv)) + (mSprint(mv) ? '⇈' : '') + sqName(mTo(mv)));
      if (Date.now() - t0 > timeMs * 0.55) break; // not enough time for another full iteration
      if (info.mateIn !== null && Math.abs(info.mateIn) <= depth / 2) break;
    }
    info.nodes = this.nodes;
    info.timeMs = Math.max(1, Date.now() - t0);
    info.nps = Math.round(this.nodes / (info.timeMs / 1000));

    // Easier levels: occasionally pick among near-best root moves
    if (this.noise > 0) {
      const scored: { m: number; s: number }[] = [];
      for (const m of root) {
        pos.make(m);
        const s = -pos.evaluate() + (Math.random() * 2 - 1) * this.noise;
        pos.unmake();
        scored.push({ m, s });
      }
      scored.sort((a, b) => b.s - a.s);
      if (Math.random() < 0.5) best = scored[0].m;
    }

    return {
      move: { from: { row: mFrom(best) >> 3, col: mFrom(best) & 7 }, to: { row: mTo(best) >> 3, col: mTo(best) & 7 }, sprint: !!mSprint(best) },
      info,
    };
  }

  private probeMove(pos: Position): number {
    const i = pos.hashLo & TT_MASK;
    return this.ttLo[i] === pos.hashLo && this.ttHi[i] === pos.hashHi ? this.ttMove[i] : 0;
  }

  private extractPv(pos: Position, depth: number): number[] {
    const pv: number[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < depth; i++) {
      const m = this.probeMove(pos);
      if (!m) break;
      const key = pos.hashLo + ':' + pos.hashHi;
      if (seen.has(key)) break;
      seen.add(key);
      const legal: number[] = [];
      pos.generate(legal);
      if (!legal.includes(m) || !pos.make(m)) break;
      pv.push(m);
    }
    for (let i = 0; i < pv.length; i++) pos.unmake();
    return pv;
  }

  private store(pos: Position, depth: number, score: number, flag: number, move: number, ply: number) {
    const i = pos.hashLo & TT_MASK;
    // depth-preferred replacement
    if (this.ttLo[i] === pos.hashLo && this.ttHi[i] === pos.hashHi && this.ttDepth[i] > depth && flag !== TT_EXACT) return;
    // store mate scores relative to this node
    if (score >= MATE_BOUND) score += ply; else if (score <= -MATE_BOUND) score -= ply;
    this.ttLo[i] = pos.hashLo; this.ttHi[i] = pos.hashHi;
    this.ttScore[i] = score; this.ttDepth[i] = depth; this.ttFlag[i] = flag; this.ttMove[i] = move;
  }

  private orderMoves(pos: Position, moves: number[], ttMove: number, ply: number): number[] {
    const b = pos.board;
    const scores = moves.map(m => {
      if (m === ttMove) return 10_000_000;
      const victim = b[mTo(m)];
      if (victim) return 1_000_000 + BASE_VALUE[Math.abs(victim)] * 100 - BASE_VALUE[Math.abs(b[mFrom(m)])]; // MVV-LVA
      const toRow = mTo(m) >> 3;
      if (Math.abs(b[mFrom(m)]) === P && (toRow === 0 || toRow === 7)) return 900_000;
      if (m === this.killers[ply][0]) return 800_000;
      if (m === this.killers[ply][1]) return 700_000;
      return this.history[(mFrom(m) << 6) | mTo(m)];
    });
    const idx = moves.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
    return idx.map(i => moves[i]);
  }

  private timeUp(): boolean {
    if ((this.nodes & 2047) === 0 && Date.now() >= this.stopAt) this.stopped = true;
    return this.stopped;
  }

  private negamax(depth: number, alpha: number, beta: number, ply: number, allowNull: boolean): number {
    const pos = this.pos;
    if (pos.kingLost) return pos.kingLost === pos.side ? -(MATE - ply) : MATE - ply;
    if (depth <= 0) return this.quiesce(alpha, beta, ply, 0);
    this.nodes++;
    if (this.timeUp()) return 0;
    if (ply > this.seldepth) this.seldepth = ply;

    // Repetition along the current path -> draw
    if (ply >= 100) return pos.evaluate();
    for (let i = this.pathLo.length - 3; i >= 0; i -= 2) {
      if (this.pathLo[i] === pos.hashLo && this.pathHi[i] === pos.hashHi) return 0;
    }

    // Mate distance pruning
    alpha = Math.max(alpha, -(MATE - ply)); beta = Math.min(beta, MATE - ply - 1);
    if (alpha >= beta) return alpha;

    const pvNode = beta - alpha > 1;
    const i = pos.hashLo & TT_MASK;
    let ttMove = 0;
    if (this.ttLo[i] === pos.hashLo && this.ttHi[i] === pos.hashHi) {
      ttMove = this.ttMove[i];
      if (!pvNode && this.ttDepth[i] >= depth && ply > 0) {
        let s = this.ttScore[i];
        if (s >= MATE_BOUND) s -= ply; else if (s <= -MATE_BOUND) s += ply;
        const f = this.ttFlag[i];
        if (f === TT_EXACT || (f === TT_LOWER && s >= beta) || (f === TT_UPPER && s <= alpha)) return s;
      }
    }

    const inCheck = pos.inCheck(pos.side);
    if (inCheck) depth++; // check extension

    // Static eval for pruning decisions
    const staticEval = inCheck ? -INF : pos.evaluate();

    // Reverse futility pruning (static null move)
    if (!pvNode && !inCheck && depth <= 3 && staticEval - 120 * depth >= beta) return staticEval;

    // Null-move pruning
    if (allowNull && !pvNode && !inCheck && depth >= 3 && staticEval >= beta && pos.hasNonPawnMaterial(pos.side)) {
      const Rn = depth >= 7 ? 3 : 2;
      pos.makeNull();
      this.pathLo.push(pos.hashLo); this.pathHi.push(pos.hashHi);
      const s = -this.negamax(depth - 1 - Rn, -beta, -beta + 1, ply + 1, false);
      this.pathLo.pop(); this.pathHi.pop();
      pos.unmakeNull();
      if (this.stopped) return 0;
      if (s >= beta) return s >= MATE_BOUND ? beta : s;
    }

    const pseudo: number[] = [];
    pos.generate(pseudo);
    const moves = this.orderMoves(pos, pseudo, ttMove, ply);

    let best = -INF, bestMove = 0, legal = 0;
    const origAlpha = alpha;
    for (const m of moves) {
      const isCapture = pos.board[mTo(m)] !== 0;
      if (!pos.make(m)) continue;
      legal++;
      this.pathLo.push(pos.hashLo); this.pathHi.push(pos.hashHi);
      let score: number;
      if (legal === 1) {
        score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        // Late Move Reductions for quiet moves searched late
        let reduction = 0;
        if (depth >= 3 && !inCheck && !isCapture && legal > 3 && !pos.inCheck(pos.side)) {
          reduction = LMR[Math.min(depth, 63)][Math.min(legal, 63)];
          if (pvNode) reduction = Math.max(0, reduction - 1);
          reduction = Math.min(reduction, depth - 2);
        }
        // PVS: null-window search first
        score = -this.negamax(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && reduction > 0) score = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta) score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      }
      this.pathLo.pop(); this.pathHi.pop();
      pos.unmake();
      if (this.stopped) return 0;

      if (score > best) { best = score; bestMove = m; }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (!isCapture) {
          // Killer + history heuristics
          const k = this.killers[ply];
          if (k[0] !== m) { k[1] = k[0]; k[0] = m; }
          this.history[(mFrom(m) << 6) | mTo(m)] += depth * depth;
        }
        break;
      }
    }

    if (legal === 0) return inCheck ? -(MATE - ply) : 0; // checkmate or stalemate

    this.store(pos, depth, best, best >= beta ? TT_LOWER : best <= origAlpha ? TT_UPPER : TT_EXACT, bestMove, ply);
    return best;
  }

  private quiesce(alpha: number, beta: number, ply: number, qdepth: number): number {
    const pos = this.pos;
    this.nodes++;
    if (this.timeUp()) return 0;
    if (ply > this.seldepth) this.seldepth = ply;
    if (pos.kingLost) return pos.kingLost === pos.side ? -(MATE - ply) : MATE - ply;

    let standPat = pos.evaluate();
    if (this.noise > 0) standPat += Math.round((Math.random() * 2 - 1) * this.noise * 0.3);
    if (standPat >= beta) return standPat;
    if (standPat > alpha) alpha = standPat;
    if (qdepth >= 8) return standPat;

    const caps: number[] = [];
    pos.generate(caps, true);
    const ordered = this.orderMoves(pos, caps, 0, Math.min(ply, 127));
    for (const m of ordered) {
      const victim = pos.board[mTo(m)];
      // Delta pruning: even winning this piece can't raise alpha
      if (victim && standPat + PIECE_CP_EG[Math.abs(victim)] + 200 < alpha) continue;
      if (!pos.make(m)) continue;
      const score = -this.quiesce(-beta, -alpha, ply + 1, qdepth + 1);
      pos.unmake();
      if (this.stopped) return 0;
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }
}

// ---------- Convenience API used by the game ----------

// Shared searcher so the transposition table persists between moves
let shared: Searcher | null = null;

export function searchBestMove(state: GameState, opts: SearchOptions = {}): SearchResult {
  const pos = Position.fromGameState(state, state.turn);
  shared ??= new Searcher();
  return shared.search(pos, opts);
}

// Static evaluation from White's point of view (centipawns)
export function evaluateForWhite(state: GameState, viewer: PlayerColor): number {
  const pos = Position.fromGameState(state, viewer);
  return pos.evaluate() * pos.side;
}

// Exposed for the test harness: legal moves in the engine's own move generator
export function engineLegalMoves(state: GameState): { from: number; to: number; sprint: boolean }[] {
  const pos = Position.fromGameState(state, state.turn);
  const pseudo: number[] = [];
  pos.generate(pseudo);
  const out: { from: number; to: number; sprint: boolean }[] = [];
  for (const m of pseudo) if (pos.make(m)) { pos.unmake(); out.push({ from: mFrom(m), to: mTo(m), sprint: !!mSprint(m) }); }
  return out;
}

export const PIECE_NAMES = TYPE_NAME;

// ---------- Difficulty levels ----------
export type Difficulty = 'squire' | 'knight' | 'warlord' | 'archmage';
export const LEVELS: Record<Difficulty, { label: string; blurb: string; opts: SearchOptions; rating: number }> = {
  squire:   { label: 'Squire',   blurb: 'Looks 2 moves ahead, makes mistakes',     opts: { maxDepth: 2, timeMs: 300, evalNoise: 120 }, rating: 900 },
  knight:   { label: 'Knight',   blurb: 'About 0.7 s of search per move',          opts: { timeMs: 700 },  rating: 1400 },
  warlord:  { label: 'Warlord',  blurb: 'About 2 s of deep search per move',       opts: { timeMs: 2000 }, rating: 1800 },
  archmage: { label: 'Archmage', blurb: 'About 5 s per move — the full engine',    opts: { timeMs: 5000 }, rating: 2100 },
};
