import { useState } from 'react';
import type { GameState, PlayerColor, PieceType } from './types';

interface IntroScreenProps {
  gameState: GameState;
  onCompleteAllocation: (
    allocations: { white: Record<PieceType, { modOffense: number, modDefense: number }>, black: Record<PieceType, { modOffense: number, modDefense: number }> },
    selectedMode: 'pvp' | 'pvc'
  ) => void;
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
  const [mode, setMode] = useState<'pvp' | 'pvc'>('pvc');
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
      onCompleteAllocation({ white: whiteAllocations, black: blackAllocations }, mode);
    }
  };

  return (
    <div className="intro-screen">
      <h1>Welcome to Gambit Chess</h1>

      <div className="rules-section" style={{ textAlign: 'left', lineHeight: '1.6' }}>
        <h2>The Game</h2>
        <p>
          Gambit Chess is a mathematically rigorous variant of traditional chess that introduces RPG-style stat allocation, a resource economy, and hidden information mechanics.
          Standard chess movement applies, but combat is determined by a strict mathematical threshold.
        </p>

        <h3>Core Mechanics</h3>
        <ul>
          <li><strong>Base Stats:</strong> Pieces have base Offense (O) and Defense (D) equal to their traditional values (Pawn=1, Knight/Bishop=3, Rook=5, Queen=9, King=Inf).</li>
          <li><strong>Combat Threshold:</strong> You can <em>only</em> execute a legal capture if the attacking piece's Total Offense (Base + Modifiers) is &ge; the defending piece's Total Defense.</li>
          <li><strong>Allocation Phase:</strong> At the start of the game, a Wolfram Rule 30 pseudo-random algorithm rolls a dice pool (3x 6d8). You must secretly allocate these points to modify your pieces' Offense or Defense before the first move.</li>
          <li><strong>Gambit Points (GP):</strong> When your piece is captured, you gain GP equal to its base value.</li>
          <li><strong>Cards & Traps:</strong> Spend GP to play powerful cards or place hidden traps on your side of the board. Enemy pieces are destroyed upon stepping on your traps!</li>
        </ul>
      </div>

      <div className="mode-selector" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Select Game Mode</h3>
        <button
          className={mode === 'pvc' ? 'active-mode' : ''}
          onClick={() => setMode('pvc')}
          style={{ marginRight: '1rem', padding: '0.8rem 1.5rem', cursor: 'pointer', borderRadius: '4px', border: mode === 'pvc' ? '2px solid #2563eb' : '1px solid #ccc' }}
        >
          1 Player (vs AI)
        </button>
        <button
          className={mode === 'pvp' ? 'active-mode' : ''}
          onClick={() => setMode('pvp')}
          style={{ padding: '0.8rem 1.5rem', cursor: 'pointer', borderRadius: '4px', border: mode === 'pvp' ? '2px solid #2563eb' : '1px solid #ccc' }}
        >
          2 Player (Local)
        </button>
      </div>

      <hr style={{ margin: '2rem 0', borderColor: '#e2e8f0' }} />

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
