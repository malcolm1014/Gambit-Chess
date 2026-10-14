import { useState, useRef } from 'react';
import type { BoardTheme } from './Piece3D';
import { createInitialState, executeMove, placeTrap, playRally, isGameOver, getLegalMoves, PIECE_ROLES, TRAP_COST } from './engine';
import { getOffense, getDefense } from './mathLogic';
import { rollAllocationPool } from './mathLogic';
import { useEffect } from 'react';
import { Board3D } from './Board3D';
import { GambitCard } from './GambitCard';
import type { CardData } from './GambitCard';
import { planComputerTurn } from './ai';
import type { ComputerTurn } from './ai';
import { LEVELS } from './search';
import type { Difficulty, SearchInfo } from './search';
import { winProbability, eloUpdate } from './stats';
import { IntroScreen } from './IntroScreen';
import type { GameState } from './types';
import './index.css';

const DEFAULT_DECK: CardData[] = [
  { id: '1', name: 'Rally', cost: 2, description: 'Give one of your pieces +2 Offense until you move.', type: 'buff' },
  { id: '2', name: 'Pitfall', cost: TRAP_COST, description: 'Hide a trap on your half. An enemy piece that enters is destroyed (Kings are immune).', type: 'trap' },
  { id: '3', name: 'Sprint', cost: 3, description: 'Move a Pawn 2 squares forward (both squares empty). Uses your move.', type: 'movement' },
];

const cap = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const PIECE_ICON: Record<string, string> = { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' };
const fmt = (n: number) => (n === Infinity ? '∞' : String(n));

// Player rating vs the computer, kept in this browser only
const RATING_KEY = 'gambit-chess-rating';
type Rating = { rating: number; games: number };
function loadRating(): Rating {
  try { const r = JSON.parse(localStorage.getItem(RATING_KEY) ?? ''); if (typeof r?.rating === 'number') return r; } catch { /* ignore */ }
  return { rating: 1200, games: 0 };
}
function saveRating(r: Rating) { try { localStorage.setItem(RATING_KEY, JSON.stringify(r)); } catch { /* ignore */ } }

const THEME_KEY = 'gambit-chess-theme';
function loadTheme(): BoardTheme {
  try { return localStorage.getItem(THEME_KEY) === 'fantasy' ? 'fantasy' : 'classic'; } catch { return 'classic'; }
}

// The search runs in a Web Worker so the board stays smooth while it thinks
function makeWorker(): Worker | null {
  try { return new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' }); } catch { return null; }
}

const fmtScore = (cp: number, mate: number | null) =>
  mate !== null ? `${mate > 0 ? '' : '-'}M${Math.abs(mate)}` : `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(2)}`;

function App() {
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialState(rollAllocationPool(), rollAllocationPool())
  );

  const [selectedSquare, setSelectedSquare] = useState<{row: number, col: number} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<'pvp' | 'pvc'>('pvc'); // default player vs computer
  const [pendingAction, setPendingAction] = useState<{type: 'trap' | 'rally' | 'sprint', card: CardData} | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('knight');
  const [engineInfo, setEngineInfo] = useState<SearchInfo | null>(null);
  const [evalWhite, setEvalWhite] = useState<{ cp: number; mate: number | null } | null>(null);
  const [rating, setRating] = useState<Rating>(loadRating);
  const [ratingDelta, setRatingDelta] = useState<number | null>(null);
  const [theme, setThemeState] = useState<BoardTheme>(loadTheme);
  const setTheme = (t: BoardTheme) => { setThemeState(t); try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ } };
  useEffect(() => { document.body.dataset.theme = theme; }, [theme]);
  const sideName = (c: 'white' | 'black') => theme === 'classic' ? (c === 'white' ? '♔ White' : '♚ Black') : (c === 'white' ? '☀ Light' : '☾ Shadow');
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const ratedGame = useRef(false);

  const gameOver = isGameOver(gameState);
  const isComputerTurn = gameMode === 'pvc' && gameState.turn === 'black';
  const selectedPiece = selectedSquare ? gameState.board[selectedSquare.row][selectedSquare.col].piece : null;
  const legalTargets = selectedSquare && !pendingAction && !gameOver && gameState.phase === 'main'
    ? getLegalMoves(gameState)
        .filter(m => m.from.row === selectedSquare.row && m.from.col === selectedSquare.col)
        .map(m => m.to)
    : [];

  // Apply the computer's decision (optional trap + move) to the current state
  const applyComputerTurn = (base: GameState, turn: ComputerTurn) => {
    let next = base;
    try {
      if (turn.trap) next = placeTrap(next, turn.trap, base.turn);
      if (turn.move) next = executeMove(next, turn.move.from, turn.move.to, { sprint: turn.move.sprint });
      setGameState(next);
    } catch (e: any) {
      console.error('Engine move failed', e);
    }
    if (turn.info) {
      setEngineInfo(turn.info);
      // The engine scores from Black's point of view; convert to White's
      setEvalWhite({ cp: -turn.info.scoreCp, mate: turn.info.mateIn === null ? null : -turn.info.mateIn });
    }
  };

  useEffect(() => {
    if (gameState.phase === 'main' && !isGameOver(gameState) && gameMode === 'pvc' && gameState.turn === 'black') {
      const id = ++requestId.current;
      const base = gameState;
      workerRef.current ??= makeWorker();
      const worker = workerRef.current;
      if (worker) {
        worker.onmessage = (e: MessageEvent<ComputerTurn & { id: number }>) => {
          if (e.data.id !== requestId.current) return; // stale answer from an old game
          applyComputerTurn(base, e.data);
        };
        worker.onerror = () => {
          // Fall back to searching on the main thread
          workerRef.current = null;
          applyComputerTurn(base, planComputerTurn(base, difficulty));
        };
        worker.postMessage({ id, state: base, level: difficulty });
      } else {
        const timer = setTimeout(() => applyComputerTurn(base, planComputerTurn(base, difficulty)), 50);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState, gameMode, difficulty]);

  // Update the player's Elo once per finished game against the computer
  useEffect(() => {
    if (!gameOver || gameMode !== 'pvc' || ratedGame.current) return;
    ratedGame.current = true;
    const score = gameState.winner === 'white' ? 1 : gameState.winner === 'black' ? 0 : 0.5;
    const updated = { rating: eloUpdate(rating.rating, LEVELS[difficulty].rating, score, rating.games), games: rating.games + 1 };
    setRatingDelta(updated.rating - rating.rating);
    setRating(updated);
    saveRating(updated);
  }, [gameOver, gameMode, gameState.winner, difficulty, rating]);

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

  const handleCompleteAllocation = (allocations: any, selectedMode: 'pvp' | 'pvc', dicePools?: { white: number, black: number }, level?: Difficulty) => {
    if (level) setDifficulty(level);
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
        if (piece && piece.type !== 'king') { // the King's infinite stats never take modifiers
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
    setEngineInfo(null);
    setEvalWhite(null);
    setRatingDelta(null);
    ratedGame.current = false;
    requestId.current++;
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
      <header className="game-header">
        <h1>Gambit Chess</h1>
        <div className="header-actions">
          <div className="theme-toggle" role="group" aria-label="Board style">
            <button className={theme === 'classic' ? 'on' : ''} onClick={() => setTheme('classic')}>Classic</button>
            <button className={theme === 'fantasy' ? 'on' : ''} onClick={() => setTheme('fantasy')}>Fantasy</button>
          </div>
          <button className="new-game-button" onClick={handleNewGame}>⟲ New Game</button>
        </div>
      </header>

      <div className="game-layout">
        <div className="board-column">
          {gameOver && (
            <div className="game-over">
              <strong>
                {gameState.status === 'checkmate' && `Checkmate! ${cap(gameState.winner)} wins.`}
                {gameState.status === 'king-destroyed' && `${cap(gameState.winner)} wins — the enemy King hit a trap!`}
                {gameState.status === 'stalemate' && 'Stalemate — the game is a draw.'}
                {gameState.status === 'draw' && 'Draw — 50 moves each without a capture.'}
              </strong>
              {gameMode === 'pvc' && ratingDelta !== null && (
                <span className="rating-change">
                  Your rating: {rating.rating} ({ratingDelta >= 0 ? '+' : ''}{ratingDelta}) vs {LEVELS[difficulty].label}
                </span>
              )}
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
            <div className="status-message">
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
            legalTargets={legalTargets}
            trapViewer={gameMode === 'pvc' ? 'white' : (isComputerTurn ? null : gameState.turn)}
            theme={theme}
          />

          <div className="cards-container">
            {DEFAULT_DECK.map(card => {
               const currentPlayer = gameState.players[gameState.turn];
               return (
                 <GambitCard
                   key={card.id}
                   card={card}
                   canAfford={!gameOver && !isComputerTurn && currentPlayer.gp >= card.cost}
                   active={pendingAction?.card.id === card.id}
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

        <aside className="side-column">
          <div className="stats">
            {(['white', 'black'] as const).map(color => (
              <div key={color} className={`player-stat side-${color} ${gameState.turn === color && !gameOver ? 'active' : ''}`}>
                <span className="side-name">
                  {sideName(color)}
                  <small>{color === 'white' ? 'White' : 'Black'}{gameMode === 'pvc' ? (color === 'white' ? ' · You' : ' · Computer') : ''}</small>
                </span>
                <span className="gp" title="Gambit Points"><span className="coin" />{gameState.players[color].gp} GP</span>
              </div>
            ))}
          </div>

          {gameMode === 'pvc' && evalWhite && (() => {
            const p = evalWhite.mate !== null ? (evalWhite.mate > 0 ? 1 : 0) : winProbability(evalWhite.cp);
            return (
              <div className="eval-bar" title="Win probability from the engine's evaluation: 1 / (1 + 10^(−eval/400))">
                <div className="eval-fill" style={{ width: `${(p * 100).toFixed(1)}%` }} />
                <span className="eval-label light">☀ {(p * 100).toFixed(0)}%</span>
                <span className="eval-label mid">{fmtScore(evalWhite.cp, evalWhite.mate)}</span>
                <span className="eval-label shadow">{((1 - p) * 100).toFixed(0)}% ☾</span>
              </div>
            );
          })()}
          <div className="info-row">
            <div className="stat-block">
              <h3>Unit</h3>
              {selectedPiece ? (
                <>
                  <div className="unit-name">
                    <span className={`unit-icon ${selectedPiece.color}`}>{PIECE_ICON[selectedPiece.type] + '\uFE0E'}</span>
                    {cap(selectedPiece.type)}
                    <span className="role-chip">{PIECE_ROLES[selectedPiece.type].title}</span>
                    {selectedPiece.tempOffense ? <span className="rally-tag">Rallied</span> : null}
                  </div>
                  <div className="stat-line"><span>⚔ Offense</span><strong>{fmt(getOffense(selectedPiece))}</strong></div>
                  <div className="stat-line"><span>🛡 Defense</span><strong>{fmt(getDefense(selectedPiece))}</strong></div>
                  <div className="stat-note">Role base {fmt(selectedPiece.baseOffense)} + dice {selectedPiece.modOffense}{selectedPiece.tempOffense ? ` + ${selectedPiece.tempOffense} rally` : ''} / Role base {fmt(selectedPiece.baseDefense)} + dice {selectedPiece.modDefense}</div>
                  <div className="stat-note">{legalTargets.length} legal move{legalTargets.length === 1 ? '' : 's'}</div>
                </>
              ) : (
                <p className="stat-note">Select one of your pieces to see its stats and legal moves.</p>
              )}
            </div>

            <div className="history-panel">
              <h3>Chronicle</h3>
              <div className="history" ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
                {gameState.history.map((msg: string, idx: number) => (
                  <div key={idx}>{msg}</div>
                ))}
                {gameState.history.length === 0 && <div>The battle begins. Light moves first…</div>}
              </div>
            </div>
          </div>

          {gameMode === 'pvc' && (
            <div className="oracle-panel">
              <h3>Oracle <small>— {LEVELS[difficulty].label} engine · your rating {rating.rating}{rating.games ? ` (${rating.games} game${rating.games === 1 ? '' : 's'})` : ''}</small></h3>
              {engineInfo ? (
                <>
                  <div className="oracle-stats">
                    <span>Depth <b>{engineInfo.depth}</b>/{engineInfo.seldepth}</span>
                    <span>Nodes <b>{engineInfo.nodes.toLocaleString()}</b></span>
                    <span>Speed <b>{(engineInfo.nps / 1000).toFixed(0)}k</b>/s</span>
                    <span>Time <b>{(engineInfo.timeMs / 1000).toFixed(2)}s</b></span>
                    <span>Eval <b>{evalWhite ? fmtScore(evalWhite.cp, evalWhite.mate) : '—'}</b> (Light)</span>
                  </div>
                  <div className="oracle-pv">Expected line: {engineInfo.pv.slice(0, 8).join('  ') || '—'}</div>
                </>
              ) : (
                <p className="stat-note">The engine reports its search after its first move.</p>
              )}
            </div>
          )}


        </aside>
      </div>
    </div>
  );
}

export default App;