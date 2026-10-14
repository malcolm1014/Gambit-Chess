/* Minimal sanity tests for the Gambit engine. Run: node game/engine.test.js */
var E = require('./engine.js');
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } }

// 1. Initial position: both sides have legal moves, nobody in check.
var b = E.initialBoard();
ok('white has 20 opening moves', E.legalMoves(b, 'w').length === 20);
ok('black has 20 opening moves', E.legalMoves(b, 'b').length === 20);
ok('no check at start', !E.inCheck(b, 'w') && !E.inCheck(b, 'b'));

// 2. Fool's mate => checkmate for white (black to move is mated).
function mv(board, fr, fc, tr, tc) {
  var ms = E.legalMoves(board, board[fr][fc].color);
  var m = ms.find(function (x) { return x.from.r === fr && x.from.c === fc && x.to.r === tr && x.to.c === tc; });
  if (!m) throw new Error('illegal test move ' + fr + fc + tr + tc);
  return E.applyMove(board, m).board;
}
// coords: row0=rank8(black), row7=rank1(white); col0=a..col7=h
b = E.initialBoard();
b = mv(b, 6, 5, 5, 5);   // f2-f3
b = mv(b, 1, 4, 3, 4);   // e7-e5
b = mv(b, 6, 6, 4, 6);   // g2-g4
b = mv(b, 0, 3, 4, 7);   // Qd8-h4#
ok("fool's mate is checkmate for white", E.status(b, 'w') === 'checkmate');

// 3. Combat Threshold: a buffed defender cannot be captured by a weak attacker.
b = E.initialBoard();
// Put a white pawn where it can capture a black piece, then over-defend the target.
b = [];
for (var i = 0; i < 8; i++) b.push([null,null,null,null,null,null,null,null]);
b[7][4] = { type: 'k', color: 'w', oMod: 0, dMod: 0, moved: true };
b[0][4] = { type: 'k', color: 'b', oMod: 0, dMod: 0, moved: true };
b[4][4] = { type: 'p', color: 'w', oMod: 0, dMod: 0, moved: true };  // O=1
b[3][3] = { type: 'p', color: 'b', oMod: 0, dMod: 5, moved: true };  // D=6 -> uncapturable by O=1 pawn
var pm = E.pseudoMoves(b, 4, 4);
var canTake = pm.some(function (m) { return m.to.r === 3 && m.to.c === 3; });
ok('over-defended pawn cannot be captured', !canTake);
// Now buff the attacker so O >= D.
b[4][4].oMod = 5; // O=6 >= D=6
pm = E.pseudoMoves(b, 4, 4);
canTake = pm.some(function (m) { return m.to.r === 3 && m.to.c === 3; });
ok('buffed attacker can now capture', canTake);

// 4. King can never be captured (Infinite defense) even when adjacent & buffed.
b = [];
for (var j = 0; j < 8; j++) b.push([null,null,null,null,null,null,null,null]);
b[4][4] = { type: 'k', color: 'b', oMod: 0, dMod: 0, moved: true };
b[4][5] = { type: 'q', color: 'w', oMod: 99, dMod: 0, moved: true };
b[7][0] = { type: 'k', color: 'w', oMod: 0, dMod: 0, moved: true };
pm = E.pseudoMoves(b, 4, 5);
var takesKing = pm.some(function (m) { return m.to.r === 4 && m.to.c === 4; });
ok('king is never a capture target', !takesKing);
ok('but king IS seen as attacked (check logic)', E.isSquareAttacked(b, 4, 4, 'w'));

// 5. Castling available from clean back rank.
b = E.initialBoard();
b[7][5] = null; b[7][6] = null; // clear f1,g1
var wm = E.legalMoves(b, 'w');
ok('kingside castling offered when path clear', wm.some(function (m){ return m.castle === 'K'; }));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
