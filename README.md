# ♟ Gambit Chess

**A web-based chess variant that fuses classic chess with RPG-style stat allocation, a Gambit-Point economy, and hidden traps.**

> ### ▶ [**Play Gambit Chess**](https://malcolm1014.github.io/gambit-chess/game/)
>
> No download, no sign-up — it runs entirely in your browser. Two-player hotseat (share one keyboard).

The landing page lives at **https://malcolm1014.github.io/gambit-chess/** once GitHub Pages is enabled (see below).

---

## What is Gambit Chess?

Gambit Chess keeps every rule of standard chess and layers four new systems on top:

| Twist | How it works |
|-------|--------------|
| 🎲 **Stat Allocation** | Before move one, each side rolls **6d8** three times and keeps the highest sum. Spend those points secretly as **+Offense** or **+Defense** on your pieces. |
| ⚔️ **Combat Threshold** | A piece may only capture an enemy when its **Total Offense ≥ the enemy's Total Defense**. Base values: Pawn 1, Knight/Bishop 3, Rook 5, Queen 9, King ∞. |
| 💰 **Gambit-Point (GP) Economy** | When *your* piece is captured you gain GP equal to its base value. Spend GP to **Empower** a piece (+1 O / +1 D) or **Set Traps**. |
| 🪤 **Hidden Traps** | Spend GP to bury a hidden trap on your half of the board. Any enemy piece that lands on it is destroyed. |

**Winning:** The King has Infinite Defense, so it can never be *captured* via the Combat Threshold — but check and checkmate work exactly like standard chess, so you win by cornering the enemy King. (A trap, however, destroys even a King.)

---

## How to play

1. **Allocate** — roll your pool, pick **+Offense** or **+Defense**, click your pieces to spend, then **Confirm** and pass the device.
2. **Maneuver** — click a piece to see its legal moves; captures must clear the Combat Threshold.
3. **Bank & spend** — losing pieces earns GP; use **Empower (3 GP)** or **Set Trap (2 GP)**.
4. **Checkmate** — corner the enemy King to win.

Full rules are available in-game via the **Rules** link.

---

## Project structure

```
.
├── index.html            # Landing page (game description + Play button)
├── game/
│   ├── index.html        # The playable game (UI)
│   ├── engine.js         # Core rules engine (movement, Combat Threshold, GP, traps)
│   └── engine.test.js    # Node sanity tests for the engine
├── .nojekyll             # Serve files as-is on GitHub Pages
└── jules_instruction_document.md  # Original design spec
```

The game is **pure HTML/CSS/JavaScript** with no build step and no dependencies, so GitHub Pages can serve it directly.

---

## Enable GitHub Pages (one-time setup)

To make the Play button live on the web:

1. Go to your repository on GitHub → **Settings** → **Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Pick the branch that holds this code and the **`/ (root)`** folder, then **Save**.
4. Wait a minute, then open **`https://malcolm1014.github.io/gambit-chess/`**.

> This code is on the `claude/tender-allen-v7tnod` branch. Either select that branch in the Pages settings, or merge it into `main` and serve from `main`.

---

## Run the tests (optional)

```bash
node game/engine.test.js
```

Verifies opening-move counts, Fool's/Scholar's-mate checkmate detection, the Combat Threshold, the King's Infinite Defense, and castling.
