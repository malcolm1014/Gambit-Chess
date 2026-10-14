/*
 * Gambit Chess - Core Engine
 * ---------------------------
 * A chess variant engine implementing:
 *   - Standard piece movement (incl. castling and auto-queen promotion)
 *   - The Combat Threshold rule: a capture is legal only when the attacker's
 *     Total Offense (base + modifiers) >= the defender's Total Defense.
 *   - Pre-game stat allocation (+O / +D modifiers)
 *   - The Gambit Point (GP) economy: when your piece is captured you gain GP
 *     equal to its base value.
 *   - Hidden Trap tokens placed on your own half of the board.
 *
 * House rule (documented): the King has Infinite Defense, so no piece can ever
 * "capture" it via the Combat Threshold. For the game to stay decisive, check
 * and checkmate follow standard chess -- the King must never be left under
 * attack. A trap, however, destroys whatever lands on it, King included.
 *
 * This file is plain functions with no DOM access so it can be unit-tested
 * under Node and reused in the browser.
 */
(function (root) {
  'use strict';

  var BASE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: Infinity };
  var FULL_NAME = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };

  function cloneBoard(board) {
    var b = new Array(8);
    for (var r = 0; r < 8; r++) {
      b[r] = new Array(8);
      for (var c = 0; c < 8; c++) {
        b[r][c] = board[r][c] ? Object.assign({}, board[r][c]) : null;
      }
    }
    return b;
  }

  function initialBoard() {
    var board = [];
    for (var r = 0; r < 8; r++) board.push([null, null, null, null, null, null, null, null]);
    var backRank = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (var c = 0; c < 8; c++) {
      board[0][c] = { type: backRank[c], color: 'b', oMod: 0, dMod: 0, moved: false };
      board[1][c] = { type: 'p', color: 'b', oMod: 0, dMod: 0, moved: false };
      board[6][c] = { type: 'p', color: 'w', oMod: 0, dMod: 0, moved: false };
      board[7][c] = { type: backRank[c], color: 'w', oMod: 0, dMod: 0, moved: false };
    }
    return board;
  }

  function inside(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

  function totalOffense(p) { return BASE[p.type] + (p.oMod || 0); }
  function totalDefense(p) {
    if (p.type === 'k') return Infinity;
    return BASE[p.type] + (p.dMod || 0);
  }

  /* Can `attacker` legally capture `defender` under the Combat Threshold? */
  function canCapture(attacker, defender) {
    return totalOffense(attacker) >= totalDefense(defender);
  }

  /* Is square (r,c) attacked by any piece of `byColor`?  Ignores the Combat
   * Threshold on purpose -- this is used for check detection, where the King
   * is treated as capturable so the game stays decisive. */
  function isSquareAttacked(board, r, c, byColor) {
    // Pawns
    var dir = byColor === 'w' ? 1 : -1; // a white pawn sits one row below the square it attacks
    for (var dc = -1; dc <= 1; dc += 2) {
      var pr = r + dir, pc = c + dc;
      if (inside(pr, pc)) {
        var pp = board[pr][pc];
        if (pp && pp.color === byColor && pp.type === 'p') return true;
      }
    }
    // Knights
    var kn = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (var i = 0; i < kn.length; i++) {
      var nr = r + kn[i][0], nc = c + kn[i][1];
      if (inside(nr, nc)) {
        var np = board[nr][nc];
        if (np && np.color === byColor && np.type === 'n') return true;
      }
    }
    // King adjacency
    for (var ar = -1; ar <= 1; ar++) {
      for (var ac = -1; ac <= 1; ac++) {
        if (ar === 0 && ac === 0) continue;
        var kr = r + ar, kc = c + ac;
        if (inside(kr, kc)) {
          var kp = board[kr][kc];
          if (kp && kp.color === byColor && kp.type === 'k') return true;
        }
      }
    }
    // Sliding: bishops/queens (diagonal), rooks/queens (orthogonal)
    var diag = [[-1,-1],[-1,1],[1,-1],[1,1]];
    var orth = [[-1,0],[1,0],[0,-1],[0,1]];
    if (slideHit(board, r, c, byColor, diag, ['b', 'q'])) return true;
    if (slideHit(board, r, c, byColor, orth, ['r', 'q'])) return true;
    return false;
  }

  function slideHit(board, r, c, byColor, dirs, types) {
    for (var i = 0; i < dirs.length; i++) {
      var dr = dirs[i][0], dc = dirs[i][1];
      var rr = r + dr, cc = c + dc;
      while (inside(rr, cc)) {
        var p = board[rr][cc];
        if (p) {
          if (p.color === byColor && types.indexOf(p.type) !== -1) return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return false;
  }

  function findKing(board, color) {
    for (var r = 0; r < 8; r++)
      for (var c = 0; c < 8; c++) {
        var p = board[r][c];
        if (p && p.color === color && p.type === 'k') return { r: r, c: c };
      }
    return null;
  }

  function inCheck(board, color) {
    var k = findKing(board, color);
    if (!k) return false;
    return isSquareAttacked(board, k.r, k.c, color === 'w' ? 'b' : 'w');
  }

  /* Pseudo-legal moves for the piece at (r,c): respects the Combat Threshold on
   * captures but does NOT verify that the mover's own King is left safe. */
  function pseudoMoves(board, r, c) {
    var p = board[r][c];
    if (!p) return [];
    var moves = [];
    var color = p.color;
    var opp = color === 'w' ? 'b' : 'w';

    function tryTarget(tr, tc) {
      if (!inside(tr, tc)) return;
      var t = board[tr][tc];
      if (!t) { moves.push({ from: { r: r, c: c }, to: { r: tr, c: tc }, capture: false }); return; }
      if (t.color === color) return;                    // own piece blocks
      if (!canCapture(p, t)) return;                     // Combat Threshold
      moves.push({ from: { r: r, c: c }, to: { r: tr, c: tc }, capture: true });
    }

    function slide(dirs) {
      for (var i = 0; i < dirs.length; i++) {
        var dr = dirs[i][0], dc = dirs[i][1];
        var rr = r + dr, cc = c + dc;
        while (inside(rr, cc)) {
          var t = board[rr][cc];
          if (!t) { moves.push({ from: { r: r, c: c }, to: { r: rr, c: cc }, capture: false }); }
          else {
            if (t.color !== color && canCapture(p, t)) moves.push({ from: { r: r, c: c }, to: { r: rr, c: cc }, capture: true });
            break;
          }
          rr += dr; cc += dc;
        }
      }
    }

    if (p.type === 'p') {
      var dir = color === 'w' ? -1 : 1;           // white moves up (row decreases)
      var startRow = color === 'w' ? 6 : 1;
      var promoRow = color === 'w' ? 0 : 7;
      // forward one
      if (inside(r + dir, c) && !board[r + dir][c]) {
        pushPawn(moves, r, c, r + dir, c, false, promoRow);
        // forward two
        if (r === startRow && !board[r + 2 * dir][c]) {
          moves.push({ from: { r: r, c: c }, to: { r: r + 2 * dir, c: c }, capture: false, double: true });
        }
      }
      // diagonal captures
      for (var dc2 = -1; dc2 <= 1; dc2 += 2) {
        var tr = r + dir, tc = c + dc2;
        if (inside(tr, tc)) {
          var tt = board[tr][tc];
          if (tt && tt.color === opp && canCapture(p, tt)) {
            pushPawn(moves, r, c, tr, tc, true, promoRow);
          }
        }
      }
    } else if (p.type === 'n') {
      var kn = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (var k = 0; k < kn.length; k++) tryTarget(r + kn[k][0], c + kn[k][1]);
    } else if (p.type === 'b') {
      slide([[-1,-1],[-1,1],[1,-1],[1,1]]);
    } else if (p.type === 'r') {
      slide([[-1,0],[1,0],[0,-1],[0,1]]);
    } else if (p.type === 'q') {
      slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
    } else if (p.type === 'k') {
      for (var ar = -1; ar <= 1; ar++)
        for (var ac = -1; ac <= 1; ac++)
          if (ar !== 0 || ac !== 0) tryTarget(r + ar, c + ac);
      // Castling (added as specials; legality re-checked in legalMoves)
      addCastling(board, r, c, p, moves);
    }
    return moves;
  }

  function pushPawn(moves, r, c, tr, tc, capture, promoRow) {
    if (tr === promoRow) {
      moves.push({ from: { r: r, c: c }, to: { r: tr, c: tc }, capture: capture, promo: 'q' });
    } else {
      moves.push({ from: { r: r, c: c }, to: { r: tr, c: tc }, capture: capture });
    }
  }

  function addCastling(board, r, c, king, moves) {
    if (king.moved) return;
    var row = king.color === 'w' ? 7 : 0;
    if (r !== row || c !== 4) return;
    var opp = king.color === 'w' ? 'b' : 'w';
    if (isSquareAttacked(board, row, 4, opp)) return; // can't castle out of check
    // Kingside: rook at col 7, squares 5,6 empty, 5,6 not attacked
    var kr = board[row][7];
    if (kr && kr.type === 'r' && !kr.moved && !board[row][5] && !board[row][6] &&
        !isSquareAttacked(board, row, 5, opp) && !isSquareAttacked(board, row, 6, opp)) {
      moves.push({ from: { r: row, c: 4 }, to: { r: row, c: 6 }, capture: false, castle: 'K' });
    }
    // Queenside: rook at col 0, squares 1,2,3 empty, 2,3 not attacked
    var qr = board[row][0];
    if (qr && qr.type === 'r' && !qr.moved && !board[row][1] && !board[row][2] && !board[row][3] &&
        !isSquareAttacked(board, row, 2, opp) && !isSquareAttacked(board, row, 3, opp)) {
      moves.push({ from: { r: row, c: 4 }, to: { r: row, c: 2 }, capture: false, castle: 'Q' });
    }
  }

  /* Apply a move to a board clone and return { board, captured }. Does not
   * handle traps or GP -- that lives in game state logic. */
  function applyMove(board, move) {
    var b = cloneBoard(board);
    var from = move.from, to = move.to;
    var piece = b[from.r][from.c];
    var captured = b[to.r][to.c] || null;
    b[to.r][to.c] = piece;
    b[from.r][from.c] = null;
    piece.moved = true;
    if (move.promo) { piece.type = move.promo; piece.oMod = 0; piece.dMod = 0; }
    if (move.castle === 'K') {
      var row = piece.color === 'w' ? 7 : 0;
      b[row][5] = b[row][7]; b[row][7] = null; if (b[row][5]) b[row][5].moved = true;
    } else if (move.castle === 'Q') {
      var row2 = piece.color === 'w' ? 7 : 0;
      b[row2][3] = b[row2][0]; b[row2][0] = null; if (b[row2][3]) b[row2][3].moved = true;
    }
    return { board: b, captured: captured };
  }

  /* Fully legal moves for a color: pseudo moves that don't leave own King in check. */
  function legalMoves(board, color) {
    var out = [];
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var p = board[r][c];
        if (!p || p.color !== color) continue;
        var pm = pseudoMoves(board, r, c);
        for (var i = 0; i < pm.length; i++) {
          var res = applyMove(board, pm[i]);
          if (!inCheck(res.board, color)) out.push(pm[i]);
        }
      }
    }
    return out;
  }

  function legalMovesFrom(board, color, r, c) {
    return legalMoves(board, color).filter(function (m) { return m.from.r === r && m.from.c === c; });
  }

  /* Game status for `color` to move: 'checkmate' | 'stalemate' | 'check' | 'ok'. */
  function status(board, color) {
    var moves = legalMoves(board, color);
    var chk = inCheck(board, color);
    if (moves.length === 0) return chk ? 'checkmate' : 'stalemate';
    return chk ? 'check' : 'ok';
  }

  function rollAllocation() {
    // roll 6d8 three times, keep the highest sum
    var best = 0;
    for (var t = 0; t < 3; t++) {
      var sum = 0;
      for (var d = 0; d < 6; d++) sum += 1 + Math.floor(Math.random() * 8);
      if (sum > best) best = sum;
    }
    return best;
  }

  var api = {
    BASE: BASE,
    FULL_NAME: FULL_NAME,
    cloneBoard: cloneBoard,
    initialBoard: initialBoard,
    totalOffense: totalOffense,
    totalDefense: totalDefense,
    canCapture: canCapture,
    isSquareAttacked: isSquareAttacked,
    findKing: findKing,
    inCheck: inCheck,
    pseudoMoves: pseudoMoves,
    applyMove: applyMove,
    legalMoves: legalMoves,
    legalMovesFrom: legalMovesFrom,
    status: status,
    rollAllocation: rollAllocation,
    inside: inside
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GambitEngine = api;
})(typeof window !== 'undefined' ? window : this);
