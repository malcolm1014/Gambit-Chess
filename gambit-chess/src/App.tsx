import { useState } from 'react';
import { createInitialState, executeMove } from './engine';
import { rollAllocationPool } from './mathLogic';
import { Board3D } from './Board3D';
import './index.css';

function App() {
  const [gameState, setGameState] = useState(() =>
    createInitialState(rollAllocationPool(), rollAllocationPool())
  );

  const [selectedSquare, setSelectedSquare] = useState<{row: number, col: number} | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSquareClick = (row: number, col: number) => {
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
      <h1>Gambit Chess 3D</h1>

      <div className="stats">
        <div className="player-stat">
          White GP: {gameState.players.white.gp} <br/>
          Turn: {gameState.turn === 'white' ? 'Active' : ''}
        </div>
        <div className="player-stat">
          Black GP: {gameState.players.black.gp} <br/>
          Turn: {gameState.turn === 'black' ? 'Active' : ''}
        </div>
      </div>

      {error && <div style={{ color: 'red', fontWeight: 'bold', marginBottom: '10px' }}>{error}</div>}

      <Board3D
        gameState={gameState}
        onSquareClick={handleSquareClick}
        selectedSquare={selectedSquare}
      />

      <div className="history">
        {gameState.history.map((msg, idx) => (
          <div key={idx}>{msg}</div>
        ))}
      </div>
    </div>
  );
}

export default App;