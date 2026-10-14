# Gambit Chess

Chess with RPG stats, dice, a sacrifice economy and hidden traps — playable free in the browser.

**▶ Play:** https://malcolm1014.github.io/Gambit-Chess/
(full-screen game only: https://malcolm1014.github.io/Gambit-Chess/play/index.html)

## Rules in brief

- **Pieces move as in chess.** Pawns move one square (no double step, no en passant) and promote to a Queen; no castling.
- **Role stats.** Every piece has Offense / Defense set by its role, plus dice points you add during setup:

  | Piece | Role | Offense | Defense | GP when lost |
  |---|---|---|---|---|
  | Pawn | Spearman | 2 | 1 | 1 |
  | Knight | Cavalry | 4 | 3 | 3 |
  | Bishop | Warden | 3 | 4 | 3 |
  | Rook | Siege Tower | 5 | 6 | 5 |
  | Queen | Commander | 9 | 7 | 9 |
  | King | Sovereign | ∞ | ∞ | — |

- **Combat Threshold.** A capture works only if attacker Offense ≥ defender Defense. The King can never be captured.
- **Setup.** Roll 6d8 three times, keep the best (average 31.8), and spend the points on piece types. The King needs none.
- **Gambit Points.** Both sides start with 10 GP. Losing a piece pays its chess value in GP.
- **Cards.** Rally (2 GP): +2 Offense until you move. Sprint (3 GP): a Pawn moves 2 squares, using your move. Pitfall (6 GP): a hidden trap on your half; enemy pieces entering it are destroyed (Kings are immune).
- **Winning.** Checkmate. Stalemate, or 50 moves each with no piece removed, is a draw.

## Project layout

- `index.html`: the landing page (rules, guide, embedded game)
- `gambit-chess/`: the game (React + TypeScript + Three.js, built with Vite)
  - `src/engine.ts`: the rules
  - `src/search.ts`: the computer opponent (alpha-beta search engine)
  - `src/stats.ts`: dice odds, win probability, Elo, chi-square
  - `src/audit.test.ts`: the math audit (runs before every deploy)
  - `simulate.ts`: 100 computer-vs-computer games
  - `stress.ts`: 1,000-game maximum stress test (card spam, chaos monkey, the game screen's computer path, GP farming)
- `.github/workflows/deploy.yml`: tests, builds and publishes to GitHub Pages on every push to `main`

## Commands (inside `gambit-chess/`)

```bash
npm ci            # install
npm run dev       # play locally
npx vitest run    # run the math audit
npx tsx simulate.ts
npx tsx stress.ts 0 1000
```
