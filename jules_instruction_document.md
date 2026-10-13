# Project Overview: Gambit Chess

Hello Jules! We are building a complex, web-based chess variant called **Gambit Chess**. This game integrates traditional chess movement with RPG-style stat allocation, a resource economy, deck-building, and hidden information (fog of war). 

Your goal is to help me build the repository from scratch, starting with the core data structures and game engine logic before moving to the UI.

## Core Game Mechanics

1. **Base Stats & Combat Threshold:**
   * Standard pieces have Base Offense (O) and Defense (D) equal to their traditional chess point values (Pawn = 1, Knight/Bishop = 3, Rook = 5, Queen = 9, King = Infinity).
   * **The Combat Rule:** A piece can only legally capture an enemy piece if its Total Offense (Base + Modifiers) is $\ge$ the enemy's Total Defense (Base + Modifiers).

2. **Pre-Game Allocation Phase:**
   * Before move 1, players roll 6d8 three times and keep the highest sum.
   * They secretly allocate these points to their pieces as either $+O$ or $+D$ modifiers. 
   * Modifiers are revealed simultaneously.

3. **The Sacrifice Economy (Gambit Points - GP):**
   * Players start with 0 GP.
   * When a player's piece is captured by the opponent, the losing player *gains* GP equal to the captured piece's *Base Value*.

4. **Gambit Cards & Traps (Spending GP):**
   * Players draw from a pre-constructed deck of Gambit Cards. Playing a card costs GP and applies special effects (e.g., temporary stat boosts, rule-bending movement).
   * Players can also spend GP on their turn to place hidden "Trap Tokens" on empty squares on their side of the board. Triggered when an enemy lands on them.

## Architectural Requirements

Standard chess logic (like a basic FEN string) is insufficient for this game. We need a custom engine.
* **Custom Board State:** We need a JSON structure (or extended FEN) to track:
  * Piece locations.
  * Individual piece stat modifiers ($+O$, $+D$).
  * Hidden trap locations (and which player owns them).
  * Current GP for each player.
* **Move Validation:** The legal move generator must first find standard pseudo-legal chess moves, then filter them through the Combat Threshold equation.
* **Turn Phases:** The game loop must handle standard movement, playing cards, setting traps, and resolving trap triggers post-movement.

## Your First Tasks (Action Items)

1. **Initialize the Project:** Set up the basic project structure (React/TypeScript or standard HTML/JS/CSS based on my upcoming prompts).
2. **Define Data Structures:** Write the TypeScript interfaces or JSON schemas for the `Piece`, `Square`, and global `GameState`. We must map out how to store the Base Stats, Modifiers, and Traps.
3. **Build the State Engine:** Scaffold the core class/functions that will take a move input, validate the Combat Threshold, update the board, and award GP if a capture occurred. 

Please acknowledge these rules and ask me how we should initialize the tech stack!