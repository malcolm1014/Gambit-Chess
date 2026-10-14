// Plays 100 full computer-vs-computer games (with traps, Rally and Sprint) and
// reports how they ended plus any rule violations it detects.
// Run with: npx tsx simulate.ts
import { createInitialState, executeMove, placeTrap, playRally, getLegalMoves, isGameOver, isInCheck } from './src/engine';
import { rollAllocationPool } from './src/mathLogic';
import { getComputerMove } from './src/ai';
import type { GameState, PieceType } from './src/types';

const TYPES: PieceType[] = ['pawn','knight','bishop','rook','queen','king'];
const issues: Record<string, number> = {};
const examples: Record<string, string> = {};
const bump = (k: string, ex = '') => { issues[k] = (issues[k]||0)+1; if (!examples[k]) examples[k] = ex; };
const endings: Record<string, number> = {};
let totalMoves = 0;
let sprints = 0;

function allocate(state: GameState) {
  for (const color of ['white','black'] as const) {
    const alloc: any = {}; TYPES.forEach(t => alloc[t] = {o:0,d:0});
    for (let i = 0; i < state.players[color].dicePool; i++) {
      const t = TYPES[Math.floor(Math.random()*6)]; alloc[t][Math.random()<.5?'o':'d']++;
    }
    for (const row of state.board) for (const sq of row) if (sq.piece?.color === color) {
      sq.piece.modOffense = alloc[sq.piece.type].o; sq.piece.modDefense = alloc[sq.piece.type].d;
    }
  }
  state.phase = 'main';
}

function check(prev: GameState, next: GameState, g: number, m: number) {
  const count = (s: GameState) => s.board.flat().filter(x => x.piece).length;
  const d = count(prev) - count(next);
  const trapHit = next.history.slice(prev.history.length).some(h => h.includes('trap!'));
  if (d < 0 || d > (trapHit ? 2 : 1)) bump('piece count changed oddly', `g${g} m${m} delta ${d}`);
  for (const sq of next.board.flat()) {
    const p = sq.piece; if (!p) continue;
    if (typeof p.baseOffense !== 'number' || typeof p.baseDefense !== 'number' || Number.isNaN(p.baseOffense))
      bump('piece base stat corrupted (not a number)', `g${g} m${m} ${p.id} O=${p.baseOffense} D=${p.baseDefense}`);
    if (p.type === 'king' && p.baseDefense !== Infinity) bump('king lost infinite defense', `g${g} m${m} ${p.id} D=${p.baseDefense}`);
    if (p.type === 'pawn' && ((p.color==='white' && sq.rank===8)||(p.color==='black' && sq.rank===1))) bump('pawn reached last rank, no promotion', `g${g} m${m} ${p.id} on ${sq.id}`);
  }
  for (const c of ['white','black'] as const) {
    const gp = next.players[c].gp;
    if (gp < 0 || !Number.isFinite(gp)) bump('GP invalid', `g${g} m${m} ${c} gp=${gp}`);
  }
}

for (let g = 1; g <= 100; g++) {
  let state = createInitialState(rollAllocationPool(), rollAllocationPool());
  allocate(state);
  let ended = 'move limit (600) reached, no winner';
  for (let m = 1; m <= 600; m++) {
    if (isGameOver(state)) { ended = `${state.status}` + (state.winner ? ` (${state.winner} wins)` : ''); break; }
    // sometimes place a trap if affordable (like a player using Pitfall)
    const me = state.turn;
    if (state.players[me].gp >= 4 && Math.random() < 0.1) {
      const rows = me === 'white' ? [4,5,6,7] : [0,1,2,3];
      const empties = rows.flatMap(r => state.board[r].map((sq,c)=>({r,c,sq}))).filter(x=>!x.sq.piece && !x.sq.trap);
      if (empties.length) {
        const pick = empties[Math.floor(Math.random()*empties.length)];
        try { state = placeTrap(state, {row:pick.r,col:pick.c}, me); } catch (e:any) { bump('placeTrap threw', e.message); }
        if (state.turn !== me) bump('placing trap ended turn', '');
      }
    }
    // sometimes play Rally on a random own piece
    if (state.players[me].gp >= 2 && Math.random() < 0.05) {
      const own = state.board.flat().map((sq,i)=>({sq,i})).filter(x=>x.sq.piece?.color===me);
      const pick = own[Math.floor(Math.random()*own.length)];
      try { state = playRally(state, {row: Math.floor(pick.i/8), col: pick.i%8}); } catch (e:any) { bump('playRally threw', e.message); }
    }
    // sometimes Sprint a pawn if legal
    if (state.players[me].gp >= 3 && Math.random() < 0.05) {
      const f = me === 'white' ? -1 : 1;
      for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
        const p = state.board[r][c].piece;
        if (p?.type==='pawn' && p.color===me && r+2*f>=0 && r+2*f<8 && state.turn===me) {
          try { const n = executeMove(state,{row:r,col:c},{row:r+2*f,col:c},{sprint:true}); check(state,n,g,m); state = n; totalMoves++; sprints++; } catch { /* not legal here */ }
        }
      }
      if (state.turn !== me || isGameOver(state)) continue;
    }
    const kingsBefore = state.board.flat().filter(s=>s.piece?.type==='king').map(s=>s.piece!.color);
    if (kingsBefore.length < 2) { ended = `king captured — game never declared a winner (${kingsBefore[0] ?? 'none'} king remains)`; bump('game continues after king captured', `g${g} m${m}`); break; }
    if (getLegalMoves(state).length === 0) bump('no legal moves but game not marked over', `g${g} m${m}`);
    const mv = getComputerMove(state, { timeMs: 25 });
    if (!mv) { ended = `${state.turn} has no legal move but game not marked over — FREEZE`; bump('freeze: no move but game not over', `g${g}`); break; }
    let next: GameState;
    try { next = executeMove(state, mv.from, mv.to, { sprint: !!mv.sprint }); }
    catch (e: any) { bump('AI chose a move that throws', e.message); ended='crash'; break; }
    const captured = state.board[mv.to.row][mv.to.col].piece;
    if (captured?.type === 'king') bump('king was captured', `g${g} m${m} ${state.board[mv.from.row][mv.from.col].piece!.id} took ${captured.id}`);
    if (captured && captured.color === state.turn) bump('captured own piece', '');
    check(state, next, g, m);
    if (isInCheck(next.board, state.turn) && next.status !== 'king-destroyed') bump('mover left own king in check', `g${g} m${m}`);
    state = next; totalMoves++;
  }
  if (isGameOver(state)) ended = `${state.status}` + (state.winner ? ` (${state.winner} wins)` : '');
  endings[ended] = (endings[ended]||0)+1;
}
console.log('Total moves played:', totalMoves, '| Sprint cards played:', sprints);
console.log('\nHow games ended:'); for (const [k,v] of Object.entries(endings)) console.log(`  ${v} × ${k}`);
console.log('\nIssues found:'); for (const [k,v] of Object.entries(issues)) console.log(`  ${v} × ${k}   e.g. ${examples[k]}`);
