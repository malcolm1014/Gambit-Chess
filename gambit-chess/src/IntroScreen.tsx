import { useState } from 'react';
import type { GameState, PlayerColor, PieceType } from './types';
import { rollAllocationPoolDetailed } from './mathLogic';

type AllocationState = Record<PieceType, { modOffense: number, modDefense: number }>;

interface IntroScreenProps {
  gameState: GameState;
  onCompleteAllocation: (
    allocations: { white: AllocationState, black: AllocationState },
    selectedMode: 'pvp' | 'pvc',
    dicePools: { white: number, black: number }
  ) => void;
}

const PIECE_TYPES: PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

const emptyAllocation = (): AllocationState => ({
  pawn: { modOffense: 0, modDefense: 0 },
  knight: { modOffense: 0, modDefense: 0 },
  bishop: { modOffense: 0, modDefense: 0 },
  rook: { modOffense: 0, modDefense: 0 },
  queen: { modOffense: 0, modDefense: 0 },
  king: { modOffense: 0, modDefense: 0 },
});

// Spread `points` randomly across piece types and stats (used for the AI,
// and for any points a player leaves unspent when they click Play).
function autoAllocate(base: AllocationState, points: number): AllocationState {
  const result: AllocationState = JSON.parse(JSON.stringify(base));
  for (let i = 0; i < points; i++) {
    const type = PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
    const stat = Math.random() < 0.5 ? 'modOffense' : 'modDefense';
    result[type][stat] += 1;
  }
  return result;
}

interface RollResult { rolls: number[]; best: number }

export function IntroScreen({ onCompleteAllocation }: IntroScreenProps) {
  const [mode, setMode] = useState<'pvp' | 'pvc'>('pvc');
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>('white');
  const [rolls, setRolls] = useState<{ white: RollResult | null, black: RollResult | null }>({ white: null, black: null });
  const [rolling, setRolling] = useState(false);
  const [pointsRemaining, setPointsRemaining] = useState(0);
  const [whiteAllocations, setWhiteAllocations] = useState<AllocationState>(emptyAllocation());
  const [blackAllocations, setBlackAllocations] = useState<AllocationState>(emptyAllocation());

  const currentRoll = rolls[currentPlayer];
  const hasRolled = currentRoll !== null;
  const currentAllocations = currentPlayer === 'white' ? whiteAllocations : blackAllocations;
  const setCurrentAllocations = currentPlayer === 'white' ? setWhiteAllocations : setBlackAllocations;

  const handleRoll = () => {
    setRolling(true);
    // Short delay so the roll feels like a roll
    setTimeout(() => {
      const result = rollAllocationPoolDetailed();
      setRolls(prev => ({ ...prev, [currentPlayer]: result }));
      setCurrentAllocations(emptyAllocation());
      setPointsRemaining(result.best);
      setRolling(false);
    }, 600);
  };

  const handleAllocate = (pieceType: PieceType, stat: 'modOffense' | 'modDefense', delta: number) => {
    if (!hasRolled) return;
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

  const handleAutoAssign = () => {
    if (!hasRolled || pointsRemaining === 0) return;
    setCurrentAllocations(prev => autoAllocate(prev, pointsRemaining));
    setPointsRemaining(0);
  };

  const handleNext = () => {
    if (!currentRoll) return;
    // Any unspent points are assigned automatically so the game can always start
    const finalCurrent = pointsRemaining > 0 ? autoAllocate(currentAllocations, pointsRemaining) : currentAllocations;

    if (currentPlayer === 'white') {
      if (mode === 'pvc') {
        // The computer (Black) rolls and allocates on its own
        const aiRoll = rollAllocationPoolDetailed();
        onCompleteAllocation(
          { white: finalCurrent, black: autoAllocate(emptyAllocation(), aiRoll.best) },
          mode,
          { white: currentRoll.best, black: aiRoll.best }
        );
      } else {
        setWhiteAllocations(finalCurrent);
        setCurrentPlayer('black');
        setPointsRemaining(0);
      }
    } else {
      onCompleteAllocation(
        { white: whiteAllocations, black: finalCurrent },
        mode,
        { white: rolls.white!.best, black: currentRoll.best }
      );
    }
  };

  const playLabel = currentPlayer === 'white' && mode === 'pvp' ? "Next: Black's Turn" : 'Play Game';

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

      {currentPlayer === 'white' && (
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
      )}

      <hr style={{ margin: '2rem 0', borderColor: '#e2e8f0' }} />

      <div className="allocation-section">
        <h2>Allocation Phase - {currentPlayer.toUpperCase()}</h2>

        <div className="dice-panel">
          {!hasRolled && <p>Roll 6d8 three times. Your best total becomes your points to spend.</p>}
          {currentRoll && (
            <div className="dice-results">
              {currentRoll.rolls.map((r, i) => (
                <div key={i} className={`dice-roll ${r === currentRoll.best && currentRoll.rolls.indexOf(r) === i ? 'best' : ''}`}>
                  <small>Roll {i + 1}</small>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}
          <button className="roll-button" onClick={handleRoll} disabled={rolling}>
            {rolling ? 'Rolling…' : hasRolled ? '🎲 Re-roll Dice' : '🎲 Roll Dice'}
          </button>
          {currentRoll && <p>You rolled <strong>{currentRoll.best}</strong> points (best of three). Re-rolling resets your allocation.</p>}
        </div>

        {hasRolled && (
          <>
            <p>Points Remaining to Allocate: <strong>{pointsRemaining}</strong>
              {pointsRemaining > 0 && (
                <button className="auto-button" onClick={handleAutoAssign}>Auto-assign</button>
              )}
            </p>

            <div className="allocation-grid">
              {PIECE_TYPES.map(pieceType => (
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
          </>
        )}
      </div>

      <button className="play-game-button" onClick={handleNext} disabled={!hasRolled || rolling}>
        {hasRolled ? playLabel : 'Roll the dice to start'}
      </button>
      {hasRolled && pointsRemaining > 0 && (
        <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Unspent points will be assigned automatically.</p>
      )}
    </div>
  );
}
