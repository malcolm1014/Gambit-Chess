import { useState } from 'react';
import { createInitialState, executeMove } from './engine';
import { rollAllocationPool } from './mathLogic';
import { useEffect } from 'react';
import { Board3D } from './Board3D';
import { GambitCard } from './GambitCard';
import type { CardData } from './GambitCard';
import { getComputerMove } from './ai';
import './index.css';

const DEFAULT_DECK: CardData[] = [
  { id: '1', name: 'Rally', cost: 2, description: 'Give an adjacent piece +2 Offense for one turn.', type: 'buff' },
  { id: '2', name: 'Pitfall', cost: 4, description: 'Place a hidden trap. Enemy unit is destroyed upon entering.', type: 'trap' },
  { id: '3', name: 'Sprint', cost: 3, description: 'Move a Pawn 2 squares forward.', type: 'movement' },
];

function App() {
  const [gameState, setGameState] = useState(() =>
    createInitialState(rollAllocationPool(), rollAllocationPool())
  );

  const [selectedSquare, setSelectedSquare] = useState<{row: number, col: number} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<'pvp' | 'pvc'>('pvc'); // default player vs computer

  useEffect(() => {
    if (gameMode === 'pvc' && gameState.turn === 'black') {
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
           // Stalemate / Game Over handling can go here
           console.log("AI has no valid moves.");
        }
      }, 500); // 500ms delay for visual effect
      return () => clearTimeout(timer);
    }
  }, [gameState, gameMode]);

  const handleSquareClick = (row: number, col: number) => {
    // If it's PVC and black's turn, ignore clicks
    if (gameMode === 'pvc' && gameState.turn === 'black') return;

    setError(null);

    // If nothing selected, select the square if it has a piece belonging to the current player
    if (!selectedSquare) {
      const piece = gameState.board[row][col].piece;
      if (piece && piece.color === gameState.turn) {
        setSelectedSquare({ row, col });
      }
    } else {
      // If something is already selected, attempt to move
      if (selectedSquare.row === row && selectedSquare.col === col) {
        // Deselect
        setSelectedSquare(null);
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

  return (
    <div className="app-container">
      <h1>Gambit Chess</h1>

      <div className="mode-selector">
        <button
          className={gameMode === 'pvc' ? 'active-mode' : ''}
          onClick={() => setGameMode('pvc')}
        >
          1 Player (vs AI)
        </button>
        <button
          className={gameMode === 'pvp' ? 'active-mode' : ''}
          onClick={() => setGameMode('pvp')}
        >
          2 Player (Local)
        </button>
      </div>

      <div className="stats">
        <div className={`player-stat ${gameState.turn === 'white' ? 'active' : ''}`}>
          White GP: {gameState.players.white.gp}
        </div>
        <div className={`player-stat ${gameState.turn === 'black' ? 'active' : ''}`}>
          Black GP: {gameState.players.black.gp}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <Board3D
        gameState={gameState}
        onSquareClick={handleSquareClick}
        selectedSquare={selectedSquare}
      />

      <div className="history">
        {gameState.history.map((msg, idx) => (
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
               canAfford={currentPlayer.gp >= card.cost}
               onPlay={(c) => console.log('Played card', c.name)}
             />
           );
        })}
      </div>
    </div>
  );
}

export default App;