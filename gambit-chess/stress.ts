// 1,000-game maximum stress test. Four play styles (engine + card spam, chaos monkey firing random valid and
// invalid actions, the game screen's own computer path, and GP-farming sacrifices); every action is checked
// for crashes, state mutation, GP ledger, trap/stat/King invariants, legal-move agreement and termination.
// Run: npx tsx stress.ts <first-game> <count>   e.g.  npx tsx stress.ts 0 1000
import { createInitialState, executeMove, placeTrap, playRally, getLegalMoves, isGameOver, isInCheck, PIECE_VALUES, PIECE_ROLES, TRAP_COST, RALLY_COST, SPRINT_COST } from './src/engine';
import { rollAllocationPool, getOffense, getDefense, canCapture } from './src/mathLogic';
import { chooseTrapSquare, planComputerTurn } from './src/ai';
import { Position, Searcher, engineLegalMoves } from './src/search';
import type { GameState, PieceType, PlayerColor } from './src/types';

const START = +(process.argv[2] || 0), COUNT = +(process.argv[3] || 10);
const ALLOC: PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
const violations: Record<string, number> = {}; const examples: Record<string, string> = {};
const bad = (k: string, ex: string) => { violations[k] = (violations[k] || 0) + 1; examples[k] ??= ex; };
const T: Record<string, number> = { games: 0, plies: 0, actions: 0, rejected: 0, traps: 0, trapKills: 0, rallies: 0, sprints: 0, chaosAttempts: 0, maxPlies: 0, maxGp: 0, kingTrapImmune: 0 };
const endings: Record<string, number> = {};
const modeName = ['engine+cards', 'chaos monkey', 'UI computer path', 'mixed/GP farming'];

const pieces = (s: GameState) => s.board.flat().filter(q => q.piece).map(q => q.piece!);
const val = (t: PieceType) => (t === 'king' ? 0 : PIECE_VALUES[t]);
const snapshot = (s: GameState) => JSON.stringify(s, (_k, v) => (v === Infinity ? 'INF' : v));

function allocate(s: GameState, mode: number) {
  for (const color of ['white', 'black'] as const) {
    const a: Record<string, [number, number]> = {}; ALLOC.forEach(t => (a[t] = [0, 0]));
    // extreme allocations sometimes: everything on one stat of one piece type
    const extreme = Math.random() < 0.2;
    const t0 = ALLOC[Math.floor(Math.random() * 5)], st0 = Math.random() < 0.5 ? 0 : 1;
    for (let i = 0; i < s.players[color].dicePool; i++) {
      if (extreme) a[t0][st0]++; else a[ALLOC[Math.floor(Math.random() * 5)]][Math.random() < 0.5 ? 0 : 1]++;
    }
    for (const r of s.board) for (const q of r) if (q.piece?.color === color && q.piece.type !== 'king') { q.piece.modOffense = a[q.piece.type][0]; q.piece.modDefense = a[q.piece.type][1]; }
  }
  s.phase = 'main';
  void mode;
}

function checkState(s: GameState, ctx: string) {
  for (const r of s.board) for (const q of r) {
    const p = q.piece;
    if (p) {
      const o = getOffense(p), d = getDefense(p);
      if (Number.isNaN(o) || Number.isNaN(d)) bad('NaN stat', ctx);
      if (p.type === 'king' && (o !== Infinity || d !== Infinity || p.modOffense || p.modDefense)) bad('King stats wrong', ctx);
      if (p.type !== 'king' && d !== PIECE_ROLES[p.type].defense + p.modDefense) bad('stat drift', ctx);
      if (p.tempOffense && p.color !== s.turn) bad('Rally bonus outlived its turn', ctx);
      if (p.tempOffense && p.tempOffense !== 2) bad('Rally bonus not +2', ctx);
    }
    if (q.trap && !(q.trap.owner === 'white' ? q.rank <= 4 : q.rank >= 5)) bad('trap on enemy half', ctx);
  }
  for (const c of ['white', 'black'] as const) { const g = s.players[c].gp; if (g < 0 || !Number.isInteger(g)) bad('GP invalid', ctx); T.maxGp = Math.max(T.maxGp, g); }
  const kings = pieces(s).filter(p => p.type === 'king');
  if (kings.length !== 2) bad('King count not 2', ctx);
  const ids = pieces(s).map(p => p.id); if (new Set(ids).size !== ids.length) bad('duplicate piece', ctx);
  if (!isGameOver(s)) { if (getLegalMoves(s).length === 0) bad('no legal moves but game not over', ctx); }
  else if (s.status === 'checkmate') { if (!isInCheck(s.board, s.turn) || getLegalMoves({ ...s, status: 'playing' }).length) bad('false checkmate', ctx); }
  else if (s.status === 'stalemate') { if (isInCheck(s.board, s.turn) || getLegalMoves({ ...s, status: 'playing' }).length) bad('false stalemate', ctx); }
  else if (s.status === 'king-destroyed') bad('King destroyed (should be impossible)', ctx);
  if ((s.movesSinceCapture ?? 0) > 100) bad('draw counter past 100', ctx);
}

function ledger(b: GameState, a: GameState, cost: Partial<Record<PlayerColor, number>>, ctx: string) {
  const lost = { white: 0, black: 0 };
  const bp = new Map(pieces(b).map(p => [p.id, p])); const ap = new Set(pieces(a).map(p => p.id));
  for (const [id, p] of bp) if (!ap.has(id)) lost[p.color] += val(p.type);
  const newH = a.history.slice(b.history.length);
  for (const h of newH) if (h.includes('The piece is destroyed')) { const p = bp.get(h.split(' ')[0]); if (p) lost[p.color] -= val(p.type); T.trapKills++; }
  T.kingTrapImmune += newH.filter(h => h.includes('Sovereign is immune')).length;
  for (const c of ['white', 'black'] as const) {
    const exp = b.players[c].gp + lost[c] - (cost[c] ?? 0);
    if (a.players[c].gp !== exp) bad('GP ledger mismatch', `${ctx} ${c}: had ${b.players[c].gp} expected ${exp} got ${a.players[c].gp}`);
  }
}

// Run an action: must either succeed (then check invariants) or throw a clean Error, never crash or mutate the input
function act(s: GameState, ctx: string, fn: (s: GameState) => GameState, cost: (s: GameState) => Partial<Record<PlayerColor, number>>): GameState {
  const before = snapshot(s);
  T.actions++;
  let next: GameState;
  try { next = fn(s); }
  catch (e: any) {
    T.rejected++;
    if (!(e instanceof Error) || e instanceof TypeError || e instanceof RangeError) bad('crash instead of clean rejection: ' + e?.message, ctx);
    if (snapshot(s) !== before) bad('rejected action mutated the state', ctx);
    return s;
  }
  if (snapshot(s) !== before) bad('action mutated the previous state', ctx);
  ledger(s, next, cost(s), ctx);
  checkState(next, ctx);
  return next;
}

const rnd = (n: number) => Math.floor(Math.random() * n);
const wild = () => { const r = Math.random(); return r < 0.8 ? rnd(8) : r < 0.9 ? [-1, 8, 100, -7][rnd(4)] : [0.5, NaN, 3.3][rnd(3)]; };
const searcher = { white: new Searcher(), black: new Searcher() };

for (let g = START; g < START + COUNT; g++) {
  const mode = g % 10 < 4 ? 0 : g % 10 < 7 ? 1 : g % 10 < 9 ? 2 : 3;
  let s = createInitialState(rollAllocationPool(), rollAllocationPool()); allocate(s, mode);
  let plies = 0;
  while (!isGameOver(s) && plies < 1500) {
    const me = s.turn, ctx = `game ${g} (${modeName[mode]}) ply ${plies}`;
    const turnStart = s;
    if (mode === 1) {
      // Chaos: 6 random actions, valid or not, then a legal random move
      for (let k = 0; k < 6; k++) {
        T.chaosAttempts++;
        const kind = rnd(4);
        if (kind === 0) s = act(s, ctx + ' chaos-trap', x => placeTrap(x, { row: wild(), col: wild() }, Math.random() < 0.85 ? me : (me === 'white' ? 'black' : 'white')), () => ({ [me]: TRAP_COST }));
        else if (kind === 1) s = act(s, ctx + ' chaos-rally', x => playRally(x, { row: wild(), col: wild() }), () => ({ [me]: RALLY_COST }));
        else if (kind === 2) s = act(s, ctx + ' chaos-sprint', x => executeMove(x, { row: wild(), col: wild() }, { row: wild(), col: wild() }, { sprint: true }), () => ({ [me]: SPRINT_COST }));
        else s = act(s, ctx + ' chaos-move', x => executeMove(x, { row: wild(), col: wild() }, { row: wild(), col: wild() }), () => ({}));
        if (s.turn !== me || isGameOver(s)) break;
      }
      if (s.turn === me && !isGameOver(s)) {
        const mv = getLegalMoves(s); const m = mv[rnd(mv.length)];
        s = act(s, ctx + ' move', x => executeMove(x, m.from, m.to), () => ({}));
      }
    } else if (mode === 2) {
      // Exactly what the game screen does for the computer: plan (trap + move), then apply
      const turn = planComputerTurn(structuredClone(s), 'squire');
      if (!turn.move) { bad('computer returned no move in a live position', ctx); break; }
      if (turn.trap) { s = act(s, ctx + ' ui-trap', x => placeTrap(x, turn.trap!, me), () => ({ [me]: TRAP_COST })); T.traps++; }
      const mv = turn.move;
      const b = s; s = act(s, ctx + ' ui-move', x => executeMove(x, mv.from, mv.to, { sprint: mv.sprint }), () => ({ [me]: mv.sprint ? SPRINT_COST : 0 }));
      if (s === b) bad('computer chose a move the rules reject', ctx);
      if (mv.sprint) T.sprints++;
    } else {
      // Card spam
      for (let k = 0; k < 3 && s.players[me].gp >= TRAP_COST; k++) {
        const at = chooseTrapSquare(s, 1); if (!at) break;
        s = act(s, ctx + ' trap', x => placeTrap(x, at, me), () => ({ [me]: TRAP_COST })); T.traps++;
      }
      if (s.players[me].gp >= RALLY_COST && Math.random() < 0.7) {
        outer: for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
          const p = s.board[r][c].piece; if (!p || p.color !== me || p.type === 'king') continue;
          for (const m of getLegalMoves({ ...s }).filter(m => m.from.row === r && m.from.col === c)) void m;
          for (let r2 = 0; r2 < 8; r2++) for (let c2 = 0; c2 < 8; c2++) {
            const t = s.board[r2][c2].piece;
            if (t && t.color !== me && t.type !== 'king' && !canCapture(p, t) && getOffense(p) + 2 >= getDefense(t)) {
              const rallied = playRally(s, { row: r, col: c });
              try { executeMove(rallied, { row: r, col: c }, { row: r2, col: c2 }); } catch { continue; }
              s = act(s, ctx + ' rally', x => playRally(x, { row: r, col: c }), () => ({ [me]: RALLY_COST })); T.rallies++;
              s = act(s, ctx + ' rally-capture', x => executeMove(x, { row: r, col: c }, { row: r2, col: c2 }), () => ({}));
              break outer;
            }
          }
        }
      }
      if (s.turn === me && !isGameOver(s)) {
        let mv: { from: any; to: any; sprint?: boolean };
        if (mode === 3 && Math.random() < (me === 'white' ? 0.3 : 0.05)) { const ms = getLegalMoves(s); mv = ms[rnd(ms.length)]; }
        else mv = searcher[me].search(Position.fromGameState(s, me), { timeMs: 5 }).move!;
        if (plies % 15 === 0) {
          const a = new Set(getLegalMoves(s).map(x => `${x.from.row}${x.from.col}${x.to.row}${x.to.col}`));
          const e = new Set(engineLegalMoves(s).filter(x => !x.sprint).map(x => `${x.from >> 3}${x.from & 7}${x.to >> 3}${x.to & 7}`));
          if (a.size !== e.size || [...a].some(x => !e.has(x))) bad('engine and rules disagree on legal moves', ctx);
        }
        const b = s; s = act(s, ctx + ' move', x => executeMove(x, mv.from, mv.to, { sprint: !!mv.sprint }), () => ({ [me]: mv.sprint ? SPRINT_COST : 0 }));
        if (s === b) bad('engine chose a move the rules reject', ctx);
        if (mv.sprint) T.sprints++;
      }
    }
    if (s.turn === me && !isGameOver(s)) { bad('turn did not pass', ctx); break; }
    if (s === turnStart) { bad('no progress', ctx); break; }
    plies++;
  }
  if (!isGameOver(s)) bad('game did not finish within 1500 plies', `game ${g}`);
  const key = `${modeName[mode]}: ${s.status}${s.winner ? ' ' + s.winner : ''}`;
  endings[key] = (endings[key] || 0) + 1;
  T.games++; T.plies += plies; T.maxPlies = Math.max(T.maxPlies, plies);
}
console.log(JSON.stringify({ endings, totals: T, violations, examples }));
