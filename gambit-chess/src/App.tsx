import { useState } from 'react';
import { createInitialState, executeMove, placeTrap, playRally, isGameOver } from './engine';
import { rollAllocationPool } from './mathLogic';
import { useEffect } from 'react';
import { Board3D } from './Board3D';
import { GambitCard } from './GambitCard';
import type { CardData } from './GambitCard';
import { getComputerMove } from './ai';
import { IntroScreen } from './IntroScreen';
import type { GameState } from './types';
import './index.css';

const DEFAULT_DECK: CardData[] = [
  { id: '1', name: 'Rally', cost: 2, description: 'Give one of your pieces +2 Offense for this turn.', type: 'buff' },
  { id: '2', name: 'Pitfall', cost: 4, description: 'Place a hidden trap. Enemy unit is destroyed upon entering.', type: 'trap' },
  { id: '3', name: 'Sprint', cost: 3, description: 'Move a Pawn 2 squares forward.', type: 'movement' },
];

const cap = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

function App() {
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialState(rollAllocationPool(), rollAllocationPool())
  );

  const [selectedSquare, setSelectedSquare] = useState<{row: number, col: number} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<'pvp' | 'pvc'>('pvc'); // default player vs computer
  const [pendingAction, setPendingAction] = useState<{type: 'trap' | 'rally' | 'sprint', card: CardData} | null>(null);

  const gameOver = isGameOver(gameState);
  const isComputerTurn = gameMode === 'pvc' && gameState.turn === 'black';

  useEffect(() => {
    if (gameState.phase === 'main' && !isGameOver(gameState) && gameMode === 'pvc' && gameState.turn === 'black') {
      // Computer's turn
      const timer = setTimeout(() => {
        const move = getComputerMove(gameState);
        if (move) {
          try {
            const newState = executeMove(gameState, move.from, move.to);
            setGameState(newState);
          } catch (e: any) {
            console.error("AI Move failed", e);
          }
        } else {
           // Should not happen: the engine marks checkmate/stalemate when a side has no moves
           console.log("AI has no valid moves.");
        }
      }, 500); // 500ms delay for visual effect
      return () => clearTimeout(timer);
    }
  }, [gameState, gameMode]);

  const handleSquareClick = (row: number, col: number) => {
    // Ignore clicks after the game ends, or while the computer is thinking
    if (gameOver || isComputerTurn) return;

    setError(null);

    if (pendingAction?.type === 'rally') {
      try {
        setGameState(playRally(gameState, { row, col }));
        setPendingAction(null);
      } catch (e: any) {
        setError(e.message); // keep the card active so the player can pick again (or Cancel)
      }
      return;
    }

    if (pendingAction?.type === 'sprint') {
      try {
        const forward = gameState.turn === 'white' ? -1 : 1;
        const piece = gameState.board[row][col].piece;
        if (!piece || piece.color !== gameState.turn || piece.type !== 'pawn') {
          throw new Error('Sprint: click one of your Pawns.');
        }
        setGameState(executeMove(gameState, { row, col }, { row: row + 2 * forward, col }, { sprint: true }));
        setPendingAction(null);
      } catch (e: any) {
        setError(e.message); // keep the card active so the player can pick again (or Cancel)
      }
      setSelectedSquare(null);
      return;
    }

    if (pendingAction?.type === 'trap') {
       try {
         // Need to check if it's on their side
         const isWhite = gameState.turn === 'white';
         const validRank = isWhite ? row > 3 : row < 4; // White is bottom (4-7), Black is top (0-3)
         if (!validRank) {
           throw new Error("You can only place a trap on your half of the board.");
         }

         const newState = placeTrap(gameState, {row, col}, gameState.turn);
         setGameState(newState);
         setPendingAction(null);
       } catch (e: any) {
         setError(e.message); // keep the card active so the player can pick again (or Cancel)
       }
       return;
    }

    // If nothing selected, select the square if it has a piece belonging to the current player
    if (!selectedSquare) {
      const piece = gameState.board[row][col].piece;
      if (piece && piece.color === gameState.turn) {
        setSelectedSquare({ row, col });
      }
    } else {
      // If something is already selected, attempt to move
      const clicked = gameState.board[row][col].piece;
      if (selectedSquare.row === row && selectedSquare.col === col) {
        // Deselect
        setSelectedSquare(null);
      } else if (clicked && clicked.color === gameState.turn) {
        // Clicking another of your own pieces switches the selection
        setSelectedSquare({ row, col });
      } else {
        try {
          const newState = executeMove(gameState, selectedSquare, { row, col });
          setGameState(newState);
          setSelectedSquare(null);
        } catch (e: any) {
          setError(e.message);
          setSelectedSquare(null);
        }
      }
    }
  };

  const handleCompleteAllocation = (allocations: any, selectedMode: 'pvp' | 'pvc', dicePools?: { white: number, black: number }) => {
    // Apply allocations to the board pieces
    const newState = { ...gameState };
    if (dicePools) {
      newState.players.white.dicePool = dicePools.white;
      newState.players.black.dicePool = dicePools.black;
    }

    // Apply stats to pieces
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = newState.board[r][c].piece;
        if (piece) {
          const colorAllocations = allocations[piece.color];
          if (colorAllocations && colorAllocations[piece.type]) {
            piece.modOffense = colorAllocations[piece.type].modOffense;
            piece.modDefense = colorAllocations[piece.type].modDefense;
          }
        }
      }
    }

    newState.players.white.allocationReady = true;
    newState.players.black.allocationReady = true;
    newState.phase = 'main';
    setGameState(newState);
    setGameMode(selectedMode);
  };

  // Start a fresh game: new board, new dice, back to the allocation screen
  const handleNewGame = () => {
    setSelectedSquare(null);
    setError(null);
    setPendingAction(null);
    setGameState(createInitialState(rollAllocationPool(), rollAllocationPool()));
  };

  if (gameState.phase === 'allocation') {
    return (
      <IntroScreen
        gameState={gameState}
        onCompleteAllocation={handleCompleteAllocation}
      />
    );
  }

  return (
    <div className="app-container">
      <h1>Gambit Chess</h1>
      <button className="new-game-button" onClick={handleNewGame}>New Game (re-roll dice)</button>

      <div className="stats">
        <div className={`player-stat ${gameState.turn === 'white' ? 'active' : ''}`}>
          White GP: {gameState.players.white.gp}
        </div>
        <div className={`player-stat ${gameState.turn === 'black' ? 'active' : ''}`}>
          Black GP: {gameState.players.black.gp}
        </div>
      </div>

      {gameOver && (
        <div className="game-over">
          <strong>
            {gameState.status === 'checkmate' && `Checkmate! ${cap(gameState.winner)} wins.`}
            {gameState.status === 'king-destroyed' && `${cap(gameState.winner)} wins — the enemy King hit a trap!`}
            {gameState.status === 'stalemate' && 'Stalemate — the game is a draw.'}
            {gameState.status === 'draw' && 'Draw — 50 moves each without a capture.'}
          </strong>
          <button onClick={handleNewGame}>Play Again</button>
        </div>
      )}
      {!gameOver && (
        <div className="turn-indicator">
          {isComputerTurn ? 'Computer is thinking…' : `${cap(gameState.turn)} to move`}
          {gameState.inCheck && <span className="check-badge">{cap(gameState.inCheck)} is in CHECK</span>}
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {pendingAction && (
        <div className="status-message" style={{ color: '#d90429', fontWeight: 'bold', margin: '10px 0' }}>
          {pendingAction.type === 'trap' && `Select an empty square on your side of the board to place ${pendingAction.card.name}.`}
          {pendingAction.type === 'rally' && 'Select one of your pieces to Rally (+2 Offense this turn).'}
          {pendingAction.type === 'sprint' && 'Select one of your Pawns to Sprint 2 squares forward.'}
          {' '}<button className="cancel-button" onClick={() => { setPendingAction(null); setError(null); }}>Cancel</button>
        </div>
      )}

      <Board3D
        gameState={gameState}
        onSquareClick={handleSquareClick}
        selectedSquare={selectedSquare}
      />

      <div className="history" ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
        {gameState.history.map((msg: string, idx: number) => (
          <div key={idx}>{msg}</div>
        ))}
        {gameState.history.length === 0 && <div>Game started. Awaiting first move...</div>}
      </div>

      <div className="cards-container">
        {DEFAULT_DECK.map(card => {
           const currentPlayer = gameState.players[gameState.turn];
           return (
             <GambitCard
               key={card.id}
               card={card}
               canAfford={!gameOver && !isComputerTurn && currentPlayer.gp >= card.cost}
               onPlay={(c) => {
                 setError(null);
                 setSelectedSquare(null);
                 if (c.id === '1') setPendingAction({ type: 'rally', card: c });
                 else if (c.id === '2') setPendingAction({ type: 'trap', card: c });
                 else if (c.id === '3') setPendingAction({ type: 'sprint', card: c });
               }}
             />
           );
        })}
      </div>
    </div>
  );
}

export default App;