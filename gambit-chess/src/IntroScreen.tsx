import React, { useState } from 'react';
import type { GameState, PlayerColor, PieceType } from './types';

interface IntroScreenProps {
  gameState: GameState;
  onCompleteAllocation: (allocations: { white: Record<PieceType, { modOffense: number, modDefense: number }>, black: Record<PieceType, { modOffense: number, modDefense: number }> }) => void;
}

type AllocationState = Record<PieceType, { modOffense: number, modDefense: number }>;

const initialAllocation: AllocationState = {
  pawn: { modOffense: 0, modDefense: 0 },
  knight: { modOffense: 0, modDefense: 0 },
  bishop: { modOffense: 0, modDefense: 0 },
  rook: { modOffense: 0, modDefense: 0 },
  queen: { modOffense: 0, modDefense: 0 },
  king: { modOffense: 0, modDefense: 0 },
};

export function IntroScreen({ gameState, onCompleteAllocation }: IntroScreenProps) {
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>('white');
  const [pointsRemaining, setPointsRemaining] = useState(gameState.players.white.dicePool);

  const [whiteAllocations, setWhiteAllocations] = useState<AllocationState>(JSON.parse(JSON.stringify(initialAllocation)));
  const [blackAllocations, setBlackAllocations] = useState<AllocationState>(JSON.parse(JSON.stringify(initialAllocation)));

  const currentAllocations = currentPlayer === 'white' ? whiteAllocations : blackAllocations;
  const setCurrentAllocations = currentPlayer === 'white' ? setWhiteAllocations : setBlackAllocations;

  const handleAllocate = (pieceType: PieceType, stat: 'modOffense' | 'modDefense', delta: number) => {
    if (delta > 0 && pointsRemaining < delta) return;
    if (delta < 0 && currentAllocations[pieceType][stat] < Math.abs(delta)) return;

    setPointsRemaining(prev => prev - delta);
    setCurrentAllocations(prev => ({
      ...prev,
      [pieceType]: {
        ...prev[pieceType],
        [stat]: prev[pieceType][stat] + delta
      }
    }));
  };

  const handleNext = () => {
    if (currentPlayer === 'white') {
      setCurrentPlayer('black');
      setPointsRemaining(gameState.players.black.dicePool);
    } else {
      onCompleteAllocation({ white: whiteAllocations, black: blackAllocations });
    }
  };

  return (
    <div className="intro-screen">
      <h1>Welcome to Gambit Chess</h1>

      <div className="rules-section">
        <h2>Rules</h2>
        <ul>
          <li><strong>Combat Threshold:</strong> You can only capture if your Total Offense &ge; enemy's Total Defense.</li>
          <li><strong>Allocation:</strong> You have rolled points to allocate to your pieces as +Offense or +Defense modifiers. These modifiers apply to ALL pieces of that type (e.g., all pawns).</li>
          <li><strong>Gambit Points (GP):</strong> Gain GP when your pieces are captured. Spend GP to play cards or place hidden traps!</li>
        </ul>
      </div>

      <div className="allocation-section">
        <h2>Allocation Phase - {currentPlayer.toUpperCase()}</h2>
        <p>You rolled <strong>{gameState.players[currentPlayer].dicePool}</strong> points.</p>
        <p>Points Remaining to Allocate: <strong>{pointsRemaining}</strong></p>

        <div className="allocation-grid">
          {(Object.keys(currentAllocations) as PieceType[]).map(pieceType => (
            <div key={pieceType} className="allocation-item">
              <strong>{pieceType.toUpperCase()}</strong>

              <div style={{ marginTop: '0.5rem' }}>
                <small>+Offense: {currentAllocations[pieceType].modOffense}</small>
                <div className="allocation-controls">
                  <button onClick={() => handleAllocate(pieceType, 'modOffense', -1)} disabled={currentAllocations[pieceType].modOffense === 0}>-</button>
                  <button onClick={() => handleAllocate(pieceType, 'modOffense', 1)} disabled={pointsRemaining === 0}>+</button>
                </div>
              </div>

              <div style={{ marginTop: '0.5rem' }}>
                <small>+Defense: {currentAllocations[pieceType].modDefense}</small>
                <div className="allocation-controls">
                  <button onClick={() => handleAllocate(pieceType, 'modDefense', -1)} disabled={currentAllocations[pieceType].modDefense === 0}>-</button>
                  <button onClick={() => handleAllocate(pieceType, 'modDefense', 1)} disabled={pointsRemaining === 0}>+</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleNext}
          disabled={pointsRemaining > 0}
        >
          {currentPlayer === 'white' ? "Next Player's Turn" : "Start Game"}
        </button>
      </div>
    </div>
  );
}
