/*
 * Mathematical audit of Gambit Chess.
 * Every formula in the game is checked against an independent definition:
 * brute-force enumeration, a reference implementation, a closed form, or a
 * hand-built position with a known answer.
 */
import { describe, it, expect } from 'vitest';
import {
  Rule30PRNG, rollDice, addStat, getOffense, getDefense, canCapture, isUncapturable, INFINITE, formatStat,
} from './mathLogic';
import {
  createInitialState, createPiece, executeMove, placeTrap, playRally, getLegalMoves, isGameOver, isInCheck,
  PIECE_ROLES, PIECE_VALUES, DRAW_PLIES_WITHOUT_CAPTURE,
} from './engine';
import { diceSumPmf, bestOfPmf, ALLOCATION_DIST, percentile, headToHead, winProbability, eloExpected, eloUpdate, eloFromScore, chiSquareCdf } from './stats';
import { Position, Searcher, ROLE_O, ROLE_D, MATE, evaluateForWhite, engineLegalMoves } from './search';
import type { GameState, PieceType, PlayerColor } from './types';

// ---------- helpers ----------
// Some audits enumerate or simulate thousands of cases; allow up to 60 s each.
const SLOW = 60_000;
const TYPES: PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const sq = (name: string) => ({ row: 8 - Number(name[1]), col: name.charCodeAt(0) - 97 });

function emptyState(turn: PlayerColor = 'white'): GameState {
  const s = createInitialState(30, 30);
  for (const row of s.board) for (const q of row) q.piece = null;
  s.phase = 'main';
  s.turn = turn;
  s.players.white.gp = 0;
  s.players.black.gp = 0;
  return s;
}
let uid = 0;
function put(s: GameState, name: string, type: PieceType, color: PlayerColor, mods: [number, number] = [0, 0]) {
  const { row, col } = sq(name);
  const p = createPiece(type, color, `${color}-${type}-${name}-${uid++}`);
  if (type !== 'king') { p.modOffense = mods[0]; p.modDefense = mods[1]; }
  s.board[row][col].piece = p;
  return p;
}

// Reference Rule 30 on a 64-cell ring, written directly from the rule table.
// Cell i's left neighbour is cell i+1 and right neighbour is cell i-1 (bit 63 is leftmost).
const RULE30 = (l: number, c: number, r: number) => (30 >> ((l << 2) | (c << 1) | r)) & 1;
function referenceRule30Next(cells: number[]): { cells: number[]; value: number } {
  let value = 0;
  for (let k = 0; k < 32; k++) {
    const next = cells.map((c, i) => RULE30(cells[(i + 1) % 64], c, cells[(i + 63) % 64]));
    cells = next;
    value = ((value << 1) | cells[31]) >>> 0;
  }
  return { cells, value };
}

function randomAllocatedGame(): GameState {
  const s = createInitialState(30, 30);
  for (const color of ['white', 'black'] as const) {
    const pts: Record<string, [number, number]> = {};
    TYPES.forEach(t => (pts[t] = [0, 0]));
    for (let i = 0; i < 30; i++) {
      const t = TYPES[Math.floor(Math.random() * 5)]; // never the King
      pts[t][Math.random() < 0.5 ? 0 : 1]++;
    }
    for (const row of s.board) for (const q of row) if (q.piece?.color === color && q.piece.type !== 'king') {
      q.piece.modOffense = pts[q.piece.type][0]; q.piece.modDefense = pts[q.piece.type][1];
    }
  }
  s.phase = 'main';
  return s;
}

// Colour-flip + vertical mirror of a position (for evaluation symmetry)
function mirror(s: GameState): GameState {
  const m = structuredClone(s);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const src = s.board[7 - r][c];
    const p = src.piece ? structuredClone(src.piece) : null;
    if (p) { p.color = p.color === 'white' ? 'black' : 'white'; p.id = p.id.replace(/^(white|black)/, p.color); }
    m.board[r][c].piece = p;
    m.board[r][c].trap = src.trap ? { ...src.trap, owner: src.trap.owner === 'white' ? 'black' : 'white' } : null;
  }
  m.turn = s.turn === 'white' ? 'black' : 'white';
  m.players.white.gp = s.players.black.gp;
  m.players.black.gp = s.players.white.gp;
  return m;
}

// ================================================================
describe('Rule 30 random number generator', () => {
  it('rule table is Wolfram rule 30 (111..000 -> 0,0,0,1,1,1,1,0)', () => {
    const out = [7, 6, 5, 4, 3, 2, 1, 0].map(n => RULE30((n >> 2) & 1, (n >> 1) & 1, n & 1));
    expect(out).toEqual([0, 0, 0, 1, 1, 1, 1, 0]);
  }, SLOW);
  it('matches an independent Rule 30 cellular automaton bit for bit', () => {
    for (const seed of [1, 12345, 987654321, 0x7fffffff]) {
      const prng = new Rule30PRNG(seed);
      let cells = Array.from({ length: 64 }, (_, i) => (i < 32 ? Math.floor(seed / 2 ** i) % 2 : 0));
      for (let n = 0; n < 50; n++) {
        const ref = referenceRule30Next(cells);
        cells = ref.cells;
        expect(prng.next()).toBe(ref.value);
      }
    }
  }, SLOW);
  it('a d8 roll has no modulo bias: floor(u·8) splits 2^32 values into 8 equal blocks of 2^29', () => {
    for (let face = 0; face < 8; face++) {
      const lo = face * 2 ** 29, hi = (face + 1) * 2 ** 29 - 1;
      expect(Math.floor((lo / 4294967296) * 8)).toBe(face);
      expect(Math.floor((hi / 4294967296) * 8)).toBe(face);
    }
  }, SLOW);
  it('the two dead Rule 30 states (all 0s, all 1s) are never used as a seed', () => {
    // all ones: 2^64−1 can't be passed as a JS number exactly, so test via the
    // 64-bit wrap of −1, which BigInt.asUintN maps to all ones
    const allOnes = new Rule30PRNG(-1);
    const zero = new Rule30PRNG(0);
    let ones = 0, zs = 0;
    for (let i = 0; i < 20; i++) { ones += allOnes.next(); zs += zero.next(); }
    expect(ones).toBeGreaterThan(0);
    expect(zs).toBeGreaterThan(0);
  }, SLOW);
  it('dice from the game generator match the exact distribution (Monte Carlo)', () => {
    const N = 60000, counts = new Array(49).fill(0);
    for (let i = 0; i < N; i++) counts[Math.max(rollDice(6, 8), rollDice(6, 8), rollDice(6, 8))]++;
    let tv = 0;
    for (let x = 0; x <= 48; x++) tv += Math.abs(counts[x] / N - ALLOCATION_DIST.pmf[x]);
    expect(tv / 2).toBeLessThan(0.02); // total variation distance
  }, SLOW);
  it('rollDice stays within n..n·sides', () => {
    for (let i = 0; i < 2000; i++) { const r = rollDice(6, 8); expect(r).toBeGreaterThanOrEqual(6); expect(r).toBeLessThanOrEqual(48); }
  }, SLOW);
});

describe('Dice probability formulas', () => {
  it('6d8 distribution equals brute-force enumeration of all 8^6 outcomes', () => {
    const counts = new Array(49).fill(0);
    for (let i = 0; i < 8 ** 6; i++) { let x = i, s = 0; for (let d = 0; d < 6; d++) { s += (x % 8) + 1; x = Math.floor(x / 8); } counts[s]++; }
    const pmf = diceSumPmf(6, 8);
    for (let t = 0; t <= 48; t++) expect(pmf[t]).toBeCloseTo(counts[t] / 8 ** 6, 12);
  }, SLOW);
  it('best-of-k formula F(x)^k − F(x−1)^k equals enumeration (2d4, best of 3)', () => {
    const single: number[] = [];
    for (let a = 1; a <= 4; a++) for (let b = 1; b <= 4; b++) single.push(a + b);
    const counts = new Array(9).fill(0);
    for (const x of single) for (const y of single) for (const z of single) counts[Math.max(x, y, z)]++;
    const pmf = bestOfPmf(3, 2, 4);
    for (let t = 0; t <= 8; t++) expect(pmf[t]).toBeCloseTo(counts[t] / single.length ** 3, 12);
  }, SLOW);
  it('allocation roll statistics', () => {
    expect(ALLOCATION_DIST.pmf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(ALLOCATION_DIST.mean).toBeCloseTo(31.764, 2);
  }, SLOW);
  it('percentile and head-to-head probabilities are consistent', () => {
    const pmf = ALLOCATION_DIST.pmf;
    for (const x of [14, 25, 31, 40, 48]) {
      const h = headToHead(pmf, x);
      expect(h.win + h.tie + h.lose).toBeCloseTo(1, 12);
      expect(percentile(pmf, x)).toBeCloseTo(100 * (h.win + h.tie / 2), 10);
    }
  }, SLOW);
});

describe('Extended-real stat arithmetic (∞)', () => {
  it('∞ + n = ∞ and finite sums are exact', () => {
    expect(addStat(INFINITE, 5)).toBe(INFINITE);
    expect(addStat(3, INFINITE, 2)).toBe(INFINITE);
    expect(addStat(2, 3, 4)).toBe(9);
    expect(formatStat(INFINITE)).toBe('∞');
  }, SLOW);
  it('undefined forms are rejected instead of producing NaN', () => {
    expect(() => addStat(INFINITE, -INFINITE)).toThrow();
    expect(() => addStat(NaN)).toThrow();
  }, SLOW);
  it('the King is uncapturable by rule, even by another King', () => {
    const k1 = createPiece('king', 'white', 'k1'), k2 = createPiece('king', 'black', 'k2');
    const q = createPiece('queen', 'white', 'q'); q.modOffense = 1000;
    expect(isUncapturable(k2)).toBe(true);
    expect(canCapture(k1, k2)).toBe(false);
    expect(canCapture(q, k2)).toBe(false);
    expect(canCapture(k1, createPiece('queen', 'black', 'q2'))).toBe(true); // ∞ ≥ any finite Defense
  }, SLOW);
  it('King stats survive every copy the game makes (structuredClone, worker messages)', () => {
    const k = createPiece('king', 'white', 'k');
    const c = structuredClone(k);
    expect(c.baseOffense).toBe(INFINITE);
    expect(c.baseDefense).toBe(INFINITE);
  }, SLOW);
});

describe('Role stats and Combat Threshold', () => {
  it('createPiece uses the role table', () => {
    for (const t of TYPES) {
      const p = createPiece(t, 'white', 'x');
      expect(p.baseOffense).toBe(PIECE_ROLES[t].offense);
      expect(p.baseDefense).toBe(PIECE_ROLES[t].defense);
    }
  }, SLOW);
  it('search engine role tables match the rules exactly', () => {
    const order: PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
    order.forEach((t, i) => { expect(ROLE_O[i + 1]).toBe(PIECE_ROLES[t].offense); expect(ROLE_D[i + 1]).toBe(PIECE_ROLES[t].defense); });
    expect(ROLE_O[7]).toBe(PIECE_ROLES.queen.offense);
    expect(ROLE_D[7]).toBe(PIECE_ROLES.queen.defense);
  }, SLOW);
  it('capture iff Offense ≥ Defense (exhaustive over role pairs and modifiers 0..4)', () => {
    for (const a of TYPES) for (const d of TYPES) for (let mo = 0; mo <= 4; mo++) for (let md = 0; md <= 4; md++) {
      const A = createPiece(a, 'white', 'a'), D = createPiece(d, 'black', 'd');
      if (a !== 'king') A.modOffense = mo;
      if (d !== 'king') D.modDefense = md;
      const expected = d !== 'king' && getOffense(A) >= getDefense(D);
      expect(canCapture(A, D)).toBe(expected);
    }
  }, SLOW);
});

describe('Gambit Points, cards and promotion', () => {
  it('captured side gains the piece\'s chess value', () => {
    const s = emptyState();
    put(s, 'e1', 'king', 'white'); put(s, 'e8', 'king', 'black');
    put(s, 'd4', 'queen', 'white'); put(s, 'd7', 'rook', 'black');
    const n = executeMove(s, sq('d4'), sq('d7'));
    expect(n.players.black.gp).toBe(PIECE_VALUES.rook);
    expect(n.players.white.gp).toBe(0);
  }, SLOW);
  it('trap costs 4 GP, Rally 2 GP (+2 Offense for one turn), Sprint 3 GP', () => {
    let s = emptyState();
    put(s, 'e1', 'king', 'white'); put(s, 'e8', 'king', 'black');
    const pawn = put(s, 'a2', 'pawn', 'white');
    s.players.white.gp = 9;
    s = placeTrap(s, sq('c3'), 'white');
    expect(s.players.white.gp).toBe(5);
    s = playRally(s, sq('a2'));
    expect(s.players.white.gp).toBe(3);
    expect(getOffense(s.board[sq('a2').row][sq('a2').col].piece!)).toBe(PIECE_ROLES.pawn.offense + 2);
    s = executeMove(s, sq('a2'), sq('a4'), { sprint: true });
    expect(s.players.white.gp).toBe(0);
    const moved = s.board[sq('a4').row][sq('a4').col].piece!;
    expect(moved.id).toBe(pawn.id);
    expect(moved.tempOffense).toBe(undefined); // Rally expired after the move
  }, SLOW);
  it('promotion: role base becomes the Commander\'s, dice modifiers are kept', () => {
    const s = emptyState();
    put(s, 'h1', 'king', 'white'); put(s, 'a8', 'king', 'black');
    put(s, 'e7', 'pawn', 'white', [3, 2]);
    const n = executeMove(s, sq('e7'), sq('e8'));
    const q = n.board[0][4].piece!;
    expect(q.type).toBe('queen');
    expect(getOffense(q)).toBe(PIECE_ROLES.queen.offense + 3);
    expect(getDefense(q)).toBe(PIECE_ROLES.queen.defense + 2);
  }, SLOW);
  it('Gambit Points never go negative over random games', () => {
    for (let g = 0; g < 10; g++) {
      let s = randomAllocatedGame();
      for (let m = 0; m < 120 && !isGameOver(s); m++) {
        const mv = getLegalMoves(s); const x = mv[Math.floor(Math.random() * mv.length)];
        s = executeMove(s, x.from, x.to);
        expect(s.players.white.gp).toBeGreaterThanOrEqual(0);
        expect(s.players.black.gp).toBeGreaterThanOrEqual(0);
        for (const row of s.board) for (const q of row) if (q.piece) {
          expect(Number.isNaN(getOffense(q.piece))).toBe(false);
          if (q.piece.type === 'king') expect(q.piece.baseDefense).toBe(INFINITE);
        }
      }
    }
  }, SLOW);
});

describe('Exploit attempts are rejected', () => {
  const start = () => { const s = createInitialState(30, 30); s.phase = 'main'; s.players.white.gp = 20; s.players.black.gp = 20; return s; };
  const cases: [string, () => unknown][] = [
    ['trap on the enemy half', () => placeTrap(start(), sq('e5'), 'white')],
    ['trap on the opponent\'s turn', () => placeTrap(start(), sq('e6'), 'black')],
    ['trap off the board', () => placeTrap(start(), { row: 9, col: 0 }, 'white')],
    ['trap during setup', () => { const s = start(); s.phase = 'allocation'; return placeTrap(s, sq('e3'), 'white'); }],
    ['rally off the board', () => playRally(start(), { row: -1, col: 3 })],
    ['rally during setup', () => { const s = start(); s.phase = 'allocation'; return playRally(s, sq('e2')); }],
    ['move off the board', () => executeMove(start(), sq('a2'), { row: 6, col: -1 })],
    ['move with fractional coordinates', () => executeMove(start(), { row: 6.5, col: 4 }, sq('e3'))],
    ['move during setup', () => { const s = start(); s.phase = 'allocation'; return executeMove(s, sq('e2'), sq('e3')); }],
  ];
  for (const [name, fn] of cases) {
    it(name, () => {
      let err: unknown = null;
      try { fn(); } catch (e) { err = e; }
      expect(err instanceof Error).toBe(true);
      expect(err instanceof TypeError).toBe(false); // a clean rule error, not a crash
    }, SLOW);
  }
});

describe('Check, checkmate, stalemate and draws', () => {
  it('detects checkmate (Queen supported by King)', () => {
    const s = emptyState();
    put(s, 'f6', 'king', 'white'); put(s, 'g1', 'queen', 'white'); put(s, 'h8', 'king', 'black');
    const n = executeMove(s, sq('g1'), sq('g7'));
    expect(n.status).toBe('checkmate');
    expect(n.winner).toBe('white');
  }, SLOW);
  it('detects stalemate (no legal move, not in check)', () => {
    const s = emptyState();
    put(s, 'h1', 'king', 'white'); put(s, 'b5', 'queen', 'white'); put(s, 'a8', 'king', 'black');
    const n = executeMove(s, sq('b5'), sq('b6'));
    expect(n.status).toBe('stalemate');
    expect(n.winner).toBe(null);
  }, SLOW);
  it('a pinned piece cannot move, and you cannot move into check', () => {
    const s = emptyState();
    put(s, 'e1', 'king', 'white'); put(s, 'e2', 'rook', 'white'); put(s, 'e8', 'rook', 'black'); put(s, 'a8', 'king', 'black');
    expect(() => executeMove(s, sq('e2'), sq('d2'))).toThrow();
    expect(() => executeMove(s, sq('e1'), sq('d2'))).not.toThrow();
    expect(isInCheck(s.board, 'white')).toBe(false);
  }, SLOW);
  it('the King (∞ Defense) is immune to traps: the trap is used up, the King survives', () => {
    let t = emptyState();
    put(t, 'd6', 'king', 'white'); put(t, 'h8', 'king', 'black');
    t.players.black.gp = 4; t.turn = 'black';
    t = placeTrap(t, sq('d7'), 'black');
    t.turn = 'white';
    t = executeMove(t, sq('d6'), sq('d7'));
    expect(t.status).toBe('playing');
    expect(t.board[sq('d7').row][sq('d7').col].piece?.type).toBe('king');
    expect(t.board[sq('d7').row][sq('d7').col].trap).toBeNull();
  }, SLOW);
  it('any other piece that steps on an enemy trap is destroyed, and its owner gets no GP', () => {
    let t = emptyState();
    put(t, 'a1', 'king', 'white'); put(t, 'h8', 'king', 'black'); put(t, 'd2', 'rook', 'white');
    t.players.black.gp = 4; t.turn = 'black';
    t = placeTrap(t, sq('d7'), 'black');
    t.turn = 'white';
    t = executeMove(t, sq('d2'), sq('d7'));
    expect(t.board[sq('d7').row][sq('d7').col].piece).toBeNull();
    expect(t.players.white.gp).toBe(0);
  }, SLOW);
  it(`draw after ${DRAW_PLIES_WITHOUT_CAPTURE} plies without a capture`, () => {
    let s = emptyState();
    put(s, 'a1', 'king', 'white'); put(s, 'h8', 'king', 'black');
    put(s, 'd4', 'knight', 'white'); put(s, 'e5', 'knight', 'black');
    s.movesSinceCapture = DRAW_PLIES_WITHOUT_CAPTURE - 1;
    const mv = getLegalMoves(s).find(m => s.board[m.to.row][m.to.col].piece === null)!;
    s = executeMove(s, mv.from, mv.to);
    expect(s.status).toBe('draw');
  }, SLOW);
});

describe('Rating and win-probability formulas', () => {
  it('Elo expectation is symmetric and inverts exactly', () => {
    for (const [a, b] of [[1400, 1200], [2100, 900], [1500, 1500]]) {
      expect(eloExpected(a, b) + eloExpected(b, a)).toBeCloseTo(1, 12);
      expect(eloFromScore(eloExpected(a, b))).toBeCloseTo(a - b, 6);
    }
    expect(eloExpected(1800, 1400)).toBeCloseTo(10 / 11, 12); // 1/(1+10^-1)
  }, SLOW);
  it('Elo update matches R′ = R + K(S − E)', () => {
    expect(eloUpdate(1200, 1400, 1, 0)).toBe(Math.round(1200 + 40 * (1 - eloExpected(1200, 1400))));
    expect(eloUpdate(1500, 1500, 0.5, 50)).toBe(1500);
  }, SLOW);
  it('win probability uses the same logistic curve as Elo', () => {
    for (const cp of [-400, -50, 0, 120, 800]) expect(winProbability(cp)).toBeCloseTo(eloExpected(cp, 0), 12);
  }, SLOW);
  it('chi-square CDF matches closed forms and table values', () => {
    for (const x of [0.5, 1, 3, 7]) expect(chiSquareCdf(x, 2)).toBeCloseTo(1 - Math.exp(-x / 2), 10); // df=2 closed form
    expect(chiSquareCdf(3.841459, 1)).toBeCloseTo(0.95, 5);
    expect(chiSquareCdf(14.06714, 7)).toBeCloseTo(0.95, 5);
    expect(chiSquareCdf(20.27774, 7)).toBeCloseTo(0.995, 5);
  }, SLOW);
});

describe('Search engine correctness', () => {
  it('generates exactly the rules engine\'s legal moves', () => {
    for (let g = 0; g < 6; g++) {
      let s = randomAllocatedGame();
      for (let m = 0; m < 80 && !isGameOver(s); m++) {
        const a = new Set(getLegalMoves(s).map(x => `${x.from.row * 8 + x.from.col}-${x.to.row * 8 + x.to.col}`));
        const b = new Set(engineLegalMoves(s).filter(x => !x.sprint).map(x => `${x.from}-${x.to}`));
        expect(a.size).toBe(b.size);
        for (const k of a) expect(b.has(k)).toBe(true);
        const mv = getLegalMoves(s); const x = mv[Math.floor(Math.random() * mv.length)];
        s = executeMove(s, x.from, x.to);
      }
    }
  }, SLOW);
  it('evaluation is colour-symmetric: eval(position) = −eval(mirrored position)', () => {
    for (let g = 0; g < 6; g++) {
      let s = randomAllocatedGame();
      for (let m = 0; m < 60 && !isGameOver(s); m++) {
        expect(evaluateForWhite(s, s.turn)).toBe(-evaluateForWhite(mirror(s), mirror(s).turn));
        const mv = getLegalMoves(s); const x = mv[Math.floor(Math.random() * mv.length)];
        s = executeMove(s, x.from, x.to);
      }
    }
  }, SLOW);
  it('incremental Zobrist hash equals a full recomputation after every move', () => {
    const s = randomAllocatedGame();
    const pos = Position.fromGameState(s, 'white');
    const moves: number[] = [];
    pos.generate(moves);
    for (const m of moves) if (pos.make(m)) {
      const lo = pos.hashLo, hi = pos.hashHi;
      pos.computeHash();
      expect(pos.hashLo).toBe(lo); expect(pos.hashHi).toBe(hi);
      pos.unmake();
    }
  }, SLOW);
  it('finds a forced mate in one and scores it as mate', () => {
    const s = emptyState();
    put(s, 'f6', 'king', 'white'); put(s, 'g1', 'queen', 'white'); put(s, 'h8', 'king', 'black');
    const r = new Searcher().search(Position.fromGameState(s, 'white'), { timeMs: 500, maxDepth: 4 });
    expect(r.info.scoreCp).toBe(MATE - 1);
    expect(r.info.mateIn).toBe(1);
    expect(r.move?.to).toEqual(sq('g7'));
  }, SLOW);
});
