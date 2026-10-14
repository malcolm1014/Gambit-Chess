// Adversarial stress test: 100 engine-vs-engine games where both sides spam traps,
// Rally and Sprint, one side deliberately sacrifices pieces to farm Gambit Points,
// and every action is checked against the rules (GP ledger, trap placement, stats,
// termination, engine/rules agreement). Run with: npx tsx stress.ts [games] [ms per move]
import { createInitialState, executeMove, placeTrap, playRally, getLegalMoves, isGameOver, isInCheck, PIECE_VALUES, PIECE_ROLES, DRAW_PLIES_WITHOUT_CAPTURE, TRAP_COST } from './src/engine';
import { rollAllocationPool, getOffense, getDefense, canCapture } from './src/mathLogic';
import { chooseTrapSquare } from './src/ai';
import { Position, Searcher, engineLegalMoves } from './src/search';
import type { GameState, PieceType, PlayerColor } from './src/types';

const GAMES = +(process.argv[2] || 100), THINK = +(process.argv[3] || 20);
const ALLOC: PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
const opp = (c: PlayerColor): PlayerColor => (c === 'white' ? 'black' : 'white');
const violations: Record<string, number> = {}; const examples: Record<string, string> = {};
const bad = (k: string, ex: string) => { violations[k] = (violations[k] || 0) + 1; examples[k] ??= ex; };
const T = { traps: 0, trapKills: 0, kingTrapKills: 0, rallies: 0, rallyCaptures: 0, sprints: 0, sacrifices: 0, gpFromLosses: 0, gpOnTraps: 0, gpOnRally: 0, gpOnSprint: 0, plies: 0, maxPlies: 0, maxGp: 0 };
const endings: Record<string, number> = {};
const lengths: number[] = [];

function allocate(s: GameState) {
  for (const color of ['white', 'black'] as const) {
    const a: Record<string, [number, number]> = {}; ALLOC.forEach(t => (a[t] = [0, 0]));
    for (let i = 0; i < s.players[color].dicePool; i++) a[ALLOC[Math.floor(Math.random() * 5)]][Math.random() < 0.5 ? 0 : 1]++;
    for (const r of s.board) for (const q of r) if (q.piece?.color === color && q.piece.type !== 'king') { q.piece.modOffense = a[q.piece.type][0]; q.piece.modDefense = a[q.piece.type][1]; }
  }
  s.phase = 'main';
}
const pieces = (s: GameState) => s.board.flat().filter(q => q.piece).map(q => q.piece!);

function checkState(s: GameState, ctx: string) {
  for (const r of s.board) for (const q of r) {
    const p = q.piece;
    if (p) {
      const o = getOffense(p), d = getDefense(p);
      if (Number.isNaN(o) || Number.isNaN(d)) bad('NaN stat', ctx);
      if (p.type === 'king' && (o !== Infinity || d !== Infinity)) bad('King lost ∞', ctx);
      if (p.type === 'king' && (p.modOffense || p.modDefense)) bad('King has modifiers', ctx);
      if (p.type !== 'king' && (d !== PIECE_ROLES[p.type].defense + p.modDefense)) bad('stat drift', ctx);
      if (p.tempOffense && p.color !== s.turn) bad('Rally bonus survived past its turn', ctx);
    }
    if (q.trap) {
      const ownHalf = q.trap.owner === 'white' ? q.rank <= 4 : q.rank >= 5;
      if (!ownHalf) bad('trap on enemy half', ctx);
    }
  }
  for (const c of ['white', 'black'] as const) if (s.players[c].gp < 0 || !Number.isInteger(s.players[c].gp)) bad('GP invalid', ctx);
  const kings = pieces(s).filter(p => p.type === 'king').length;
  if (kings < 2 && s.status !== 'king-destroyed') bad('King missing without game over', ctx);
  if (!isGameOver(s)) {
    if (getLegalMoves(s).length === 0) bad('no legal moves but game not over', ctx);
  } else if (s.status === 'checkmate') {
    if (!isInCheck(s.board, s.turn) || getLegalMoves(s).length) bad('false checkmate', ctx);
  } else if (s.status === 'stalemate') {
    if (isInCheck(s.board, s.turn) || getLegalMoves({ ...s, status: 'playing' }).length) bad('false stalemate', ctx);
  }
}

// Apply an action and verify the GP ledger: change = +value of own pieces lost − card costs
function ledger(before: GameState, after: GameState, cost: { white: number; black: number }, ctx: string) {
  const lost = { white: 0, black: 0 };
  const bIds = new Map(pieces(before).map(p => [p.id, p])); const aIds = new Set(pieces(after).map(p => p.id));
  const trapKills = after.history.slice(before.history.length).filter(h => h.includes('stepped on a hidden trap')).length;
  const val = (t: PieceType) => (t === 'king' ? 0 : PIECE_VALUES[t]);
  for (const [id, p] of bIds) if (!aIds.has(id)) lost[p.color] += val(p.type);
  // a piece killed by a trap earns its owner nothing: subtract those
  const trapVictims = after.history.slice(before.history.length).filter(h => h.includes('stepped on a hidden trap')).map(h => h.split(' ')[0]);
  for (const id of trapVictims) { const p = bIds.get(id); if (p) lost[p.color] -= val(p.type); }
  for (const c of ['white', 'black'] as const) {
    const expected = before.players[c].gp + lost[c] - cost[c];
    if (after.players[c].gp !== expected) bad('GP ledger mismatch (GP created or destroyed)', `${ctx} ${c}: had ${before.players[c].gp}, expected ${expected}, got ${after.players[c].gp}`);
  }
  T.gpFromLosses += lost.white + lost.black;
  T.trapKills += trapKills;
}

const searchers = { white: new Searcher(), black: new Searcher() };
for (let g = 1; g <= GAMES; g++) {
  let s = createInitialState(rollAllocationPool(), rollAllocationPool()); allocate(s);
  const sacrificer: PlayerColor = g % 2 ? 'white' : 'black'; // one side plays a "gambit" style
  let plies = 0;
  while (!isGameOver(s) && plies < 2000) {
    const me = s.turn, ctx = `g${g} ply${plies}`;
    // 1) Traps: place as many as the heuristic likes (spam)
    for (let k = 0; k < 3 && s.players[me].gp >= TRAP_COST; k++) {
      let at = chooseTrapSquare(s, 1);
      if (!at) {
        const rows = me === 'white' ? [4, 5, 6, 7] : [0, 1, 2, 3];
        const empties = rows.flatMap(r => s.board[r].map((q, c) => ({ r, c, q }))).filter(x => !x.q.piece && !x.q.trap);
        if (!empties.length || Math.random() < 0.5) break;
        const e = empties[Math.floor(Math.random() * empties.length)]; at = { row: e.r, col: e.c };
      }
      const b = s; s = placeTrap(s, at, me); T.traps++; T.gpOnTraps += TRAP_COST;
      ledger(b, s, { white: me === 'white' ? TRAP_COST : 0, black: me === 'black' ? TRAP_COST : 0 }, ctx + ' trap');
    }
    // 2) Rally: find a capture that only becomes possible with +2 Offense
    if (s.players[me].gp >= 2) {
      const candidates: { from: any; to: any }[] = [];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const p = s.board[r][c].piece; if (!p || p.color !== me || p.type === 'king') continue;
        for (let r2 = 0; r2 < 8; r2++) for (let c2 = 0; c2 < 8; c2++) {
          const t = s.board[r2][c2].piece;
          if (t && t.color !== me && t.type !== 'king' && !canCapture(p, t) && getOffense(p) + 2 >= getDefense(t)) candidates.push({ from: { row: r, col: c }, to: { row: r2, col: c2 } });
        }
      }
      for (const cand of candidates.sort(() => Math.random() - 0.5)) {
        const rallied = playRally(s, cand.from);
        try {
          const b = rallied; const n = executeMove(rallied, cand.from, cand.to);
          ledger(s, rallied, { white: me === 'white' ? 2 : 0, black: me === 'black' ? 2 : 0 }, ctx + ' rally');
          ledger(b, n, { white: 0, black: 0 }, ctx + ' rally-capture');
          T.rallies++; T.rallyCaptures++; T.gpOnRally += 2; s = n; break;
        } catch { /* move not legal (geometry/check) — try another */ }
      }
      if (s.turn !== me) { checkState(s, ctx); plies++; continue; }
    }
    // 3) Move: engine move, or a deliberate sacrifice for the gambit side
    let mv: { from: any; to: any; sprint?: boolean } | null = null;
    if (me === sacrificer && Math.random() < 0.2) {
      const moves = getLegalMoves(s); // a random move often hangs material -> GP for us
      mv = moves[Math.floor(Math.random() * moves.length)]; T.sacrifices++;
    } else {
      mv = searchers[me].search(Position.fromGameState(s, me), { timeMs: THINK }).move;
    }
    if (!mv) { bad('engine returned no move in a live position', ctx); break; }
    if (plies % 10 === 0) {
      const a = new Set(getLegalMoves(s).map(x => `${x.from.row}${x.from.col}${x.to.row}${x.to.col}`));
      const e = new Set(engineLegalMoves(s).filter(x => !x.sprint).map(x => `${x.from >> 3}${x.from & 7}${x.to >> 3}${x.to & 7}`));
      if (a.size !== e.size || [...a].some(x => !e.has(x))) bad('engine and rules disagree on legal moves', ctx);
    }
    const b = s;
    try { s = executeMove(s, mv.from, mv.to, { sprint: !!mv.sprint }); }
    catch (err: any) { bad('legal move rejected: ' + err.message, ctx); break; }
    if (mv.sprint) { T.sprints++; T.gpOnSprint += 3; }
    ledger(b, s, { white: me === 'white' && mv.sprint ? 3 : 0, black: me === 'black' && mv.sprint ? 3 : 0 }, ctx + ' move');
    if (s.status === 'king-destroyed') T.kingTrapKills++;
    checkState(s, ctx);
    T.maxGp = Math.max(T.maxGp, s.players.white.gp, s.players.black.gp);
    plies++;
  }
  if (!isGameOver(s)) bad('game did not terminate within 2000 plies', `g${g}`);
  const key = s.status + (s.winner ? ` (${s.winner === sacrificer ? 'gambit side' : 'solid side'} won)` : '');
  endings[key] = (endings[key] || 0) + 1;
  T.plies += plies; T.maxPlies = Math.max(T.maxPlies, plies); lengths.push(plies);
}
lengths.sort((a, b) => a - b);
console.log(JSON.stringify({ endings, totals: T, medianPlies: lengths[lengths.length >> 1], violations, examples }, null, 2));
