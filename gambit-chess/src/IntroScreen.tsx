import { useState } from 'react';
import type { GameState, PlayerColor, PieceType } from './types';
import { rollAllocationPoolDetailed } from './mathLogic';
import { PIECE_ROLES } from './engine';
import { ALLOCATION_DIST, percentile, headToHead } from './stats';
import { LEVELS } from './search';
import type { Difficulty } from './search';

type AllocationState = Record<PieceType, { modOffense: number, modDefense: number }>;

interface IntroScreenProps {
  gameState: GameState;
  onCompleteAllocation: (
    allocations: { white: AllocationState, black: AllocationState },
    selectedMode: 'pvp' | 'pvc',
    dicePools: { white: number, black: number },
    difficulty: Difficulty
  ) => void;
}

const ALLOCATABLE: PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
const fmtStat = (n: number) => (n === Infinity ? '∞' : String(n));

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
    // The King's stats are already infinite, so points there would be wasted
    const type = ALLOCATABLE[Math.floor(Math.random() * ALLOCATABLE.length)];
    const stat = Math.random() < 0.5 ? 'modOffense' : 'modDefense';
    result[type][stat] += 1;
  }
  return result;
}

interface RollResult { rolls: number[]; best: number }

export function IntroScreen({ onCompleteAllocation }: IntroScreenProps) {
  const [mode, setMode] = useState<'pvp' | 'pvc'>('pvc');
  const [difficulty, setDifficulty] = useState<Difficulty>('knight');
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
    if (!hasRolled || pieceType === 'king') return; // ∞ + n = ∞: points on the King would be wasted
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
          { white: currentRoll.best, black: aiRoll.best },
          difficulty
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
        { white: rolls.white!.best, black: currentRoll.best },
        difficulty
      );
    }
  };

  const playLabel = currentPlayer === 'white' && mode === 'pvp' ? "Next: Black's Turn" : 'Play Game';

  return (
    <div className="intro-screen">
      <h1>Gambit Chess</h1>
      <p className="tagline">Roll the bones. Arm your army. Outwit the Shadow.</p>

      <div className="rules-section">
        <h2>The Game</h2>
        <p>
          Gambit Chess is a mathematically rigorous variant of traditional chess that introduces RPG-style stat allocation, a resource economy, and hidden information mechanics.
          Standard chess movement applies, but combat is determined by a strict mathematical threshold.
        </p>
        <h3>Core Mechanics</h3>
        <ul>
          <li><strong>Base Stats by Role:</strong> Every piece starts with Offense (O) and Defense (D) that fit who it is: Pawn <em>Spearman</em> 2/1, Knight <em>Cavalry</em> 4/3, Bishop <em>Warden</em> 3/4, Rook <em>Siege Tower</em> 5/6, Queen <em>Commander</em> 9/7, King <em>Sovereign</em> ∞/∞. Your dice points are added on top.</li>
          <li><strong>Combat Threshold:</strong> You can <em>only</em> execute a legal capture if the attacking piece's Total Offense (Base + Modifiers, +2 with Rally) is &ge; the defending piece's Total Defense. The King can never be captured.</li>
          <li><strong>Allocation Phase:</strong> At the start of the game, a Wolfram Rule 30 pseudo-random algorithm rolls 6d8 three times and keeps the best total (average 31.8). You secretly add these points to your piece types' Offense or Defense before the first move.</li>
          <li><strong>Gambit Points (GP):</strong> Both sides start with 10 GP. When your piece is captured, you gain GP equal to its chess value (Pawn 1, Knight/Bishop 3, Rook 5, Queen 9).</li>
          <li><strong>Cards & Traps:</strong> Spend GP on Rally (2 GP), Sprint (3 GP) or a hidden Pitfall trap (6 GP) on your half of the board. Enemy pieces that step on your trap are destroyed — except the King, whose infinite Defense just uses the trap up.</li>
          <li><strong>Winning:</strong> Checkmate the enemy King. Stalemate, or 50 moves each with no piece removed, is a draw.</li>
        </ul>
      </div>

      {currentPlayer === 'white' && (
        <div className="mode-selector">
          <h3>Choose Your Battle</h3>
          <button
            className={mode === 'pvc' ? 'active-mode' : ''}
            onClick={() => setMode('pvc')}
          >
            1 Player (vs AI)
          </button>
          <button
            className={mode === 'pvp' ? 'active-mode' : ''}
            onClick={() => setMode('pvp')}
          >
            2 Player (Local)
          </button>
          {mode === 'pvc' && (
            <div className="difficulty-selector">
              <h3>Computer Strength</h3>
              <div className="difficulty-options">
                {(Object.keys(LEVELS) as Difficulty[]).map(d => (
                  <button key={d} className={difficulty === d ? 'active-mode' : ''} onClick={() => setDifficulty(d)}>
                    <strong>{LEVELS[d].label}</strong>
                    <small>{LEVELS[d].blurb}</small>
                    <small className="rating">est. {LEVELS[d].rating} Elo</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <hr className="divider" />

      <div className="allocation-section">
        <h2>Arm Your Army — {currentPlayer === 'white' ? '☀ Light (White)' : '☾ Shadow (Black)'}</h2>

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
          <DiceStats value={currentRoll?.best ?? null} />
        </div>

        {hasRolled && (
          <>
            <p>Points Remaining to Allocate: <strong>{pointsRemaining}</strong>
              {pointsRemaining > 0 && (
                <button className="auto-button" onClick={handleAutoAssign}>Auto-assign</button>
              )}
            </p>

            <div className="allocation-grid">
              {ALLOCATABLE.map(pieceType => (
                <div key={pieceType} className="allocation-item">
                  <strong>{pieceType.toUpperCase()}</strong>
                  <div className="role-title">{PIECE_ROLES[pieceType].title}</div>
                  <div className="role-blurb">{PIECE_ROLES[pieceType].blurb}</div>
                  <div className="role-total">
                    ⚔ {fmtStat(PIECE_ROLES[pieceType].offense + currentAllocations[pieceType].modOffense)}
                    {'  '}🛡 {fmtStat(PIECE_ROLES[pieceType].defense + currentAllocations[pieceType].modDefense)}
                  </div>
                  <div className="stat-row">
                    <small>⚔ Offense: base {fmtStat(PIECE_ROLES[pieceType].offense)} + {currentAllocations[pieceType].modOffense}</small>
                    <div className="allocation-controls">
                      <button onClick={() => handleAllocate(pieceType, 'modOffense', -1)} disabled={currentAllocations[pieceType].modOffense === 0}>-</button>
                      <button onClick={() => handleAllocate(pieceType, 'modOffense', 1)} disabled={pointsRemaining === 0}>+</button>
                    </div>
                  </div>
                  <div className="stat-row">
                    <small>🛡 Defense: base {fmtStat(PIECE_ROLES[pieceType].defense)} + {currentAllocations[pieceType].modDefense}</small>
                    <div className="allocation-controls">
                      <button onClick={() => handleAllocate(pieceType, 'modDefense', -1)} disabled={currentAllocations[pieceType].modDefense === 0}>-</button>
                      <button onClick={() => handleAllocate(pieceType, 'modDefense', 1)} disabled={pointsRemaining === 0}>+</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="king-note">♚ <b>King — Sovereign:</b> Offense and Defense are already infinite (∞ + any points = ∞), so it needs no points. It can never be captured — only checkmated.</p>
          </>
        )}
      </div>

      <button className="play-game-button" onClick={handleNext} disabled={!hasRolled || rolling}>
        {hasRolled ? playLabel : 'Roll the dice to start'}
      </button>
      {hasRolled && pointsRemaining > 0 && (
        <p className="hint">Unspent points will be assigned automatically.</p>
      )}
    </div>
  );
}

// Exact distribution of the allocation roll with the player's result highlighted
function DiceStats({ value }: { value: number | null }) {
  const d = ALLOCATION_DIST;
  const lo = 14, hi = 48; // values below 14 have probability < 0.0001%
  const maxP = Math.max(...d.pmf);
  const w = 100 / (hi - lo + 1);
  const h2h = value !== null ? headToHead(d.pmf, value) : null;
  return (
    <div className="dice-stats">
      <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="dice-hist" aria-label="Probability of each best-of-three total">
        {d.pmf.slice(lo, hi + 1).map((p, i) => {
          const x = lo + i, bh = (p / maxP) * 30;
          return <rect key={x} x={i * w + w * 0.1} y={32 - bh} width={w * 0.8} height={bh}
            className={value === x ? 'bar you' : 'bar'}><title>{`${x}: ${(p * 100).toFixed(2)}%`}</title></rect>;
        })}
      </svg>
      <div className="dice-axis"><span>{lo}</span><span>Exact odds of each total (best of three 6d8)</span><span>{hi}</span></div>
      <div className="dice-facts">
        <span>Average <b>{d.mean.toFixed(1)}</b></span>
        <span>Std dev <b>{d.sd.toFixed(1)}</b></span>
        {value !== null && <span>Your roll: <b>{percentile(d.pmf, value).toFixed(0)}th</b> percentile</span>}
        {h2h && <span>Beats the opponent's roll <b>{(h2h.win * 100).toFixed(0)}%</b> · ties {(h2h.tie * 100).toFixed(0)}%</span>}
      </div>
    </div>
  );
}
