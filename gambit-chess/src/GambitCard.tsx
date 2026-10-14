import React from 'react';

export interface CardData {
  id: string;
  name: string;
  cost: number;
  description: string;
  type: 'buff' | 'trap' | 'movement';
}

interface GambitCardProps {
  card: CardData;
  canAfford: boolean;
  onPlay: (card: CardData) => void;
  active?: boolean; // true while the player is choosing a target for this card
}

// Original line-art illustrations for each card type
const CardArt: React.FC<{ type: CardData['type'] }> = ({ type }) => {
  if (type === 'buff') {
    // Rally: a war banner crossed with a sword
    return (
      <svg viewBox="0 0 100 80" className="card-svg" aria-hidden="true">
        <defs>
          <radialGradient id="glow-buff" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffcf5a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffcf5a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="40" r="34" fill="url(#glow-buff)" />
        <line x1="34" y1="70" x2="34" y2="10" stroke="#e9d8a6" strokeWidth="3" />
        <path d="M35 12 L68 16 L60 26 L68 36 L35 32 Z" fill="#c0392b" stroke="#f2c14e" strokeWidth="1.5" />
        <path d="M44 22 l4 -4 l4 4 l-4 4 z" fill="#f2c14e" />
        <g transform="rotate(35 58 46)">
          <rect x="56" y="18" width="5" height="40" rx="1" fill="#dfe6ee" stroke="#8a94a6" />
          <rect x="49" y="56" width="19" height="4" rx="1" fill="#f2c14e" />
          <rect x="56.5" y="60" width="4" height="9" fill="#6b4226" />
          <circle cx="58.5" cy="71" r="2.6" fill="#f2c14e" />
        </g>
      </svg>
    );
  }
  if (type === 'trap') {
    // Pitfall: a spiked pit glowing with a red rune circle
    return (
      <svg viewBox="0 0 100 80" className="card-svg" aria-hidden="true">
        <defs>
          <radialGradient id="glow-trap" cx="50%" cy="60%" r="50%">
            <stop offset="0%" stopColor="#ff3355" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ff3355" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="50" cy="50" rx="40" ry="24" fill="url(#glow-trap)" />
        <ellipse cx="50" cy="52" rx="30" ry="12" fill="#14090d" stroke="#ff3355" strokeWidth="2" />
        <ellipse cx="50" cy="52" rx="36" ry="16" fill="none" stroke="#ff8095" strokeWidth="1" strokeDasharray="3 4" />
        {[30, 38, 46, 54, 62, 70].map((x, i) => (
          <path key={i} d={`M${x - 4} 56 L${x} ${38 + (i % 2) * 5} L${x + 4} 56 Z`} fill="#b8c0cc" stroke="#5c6470" strokeWidth="0.8" />
        ))}
      </svg>
    );
  }
  // Sprint: a winged boot with speed lines
  return (
    <svg viewBox="0 0 100 80" className="card-svg" aria-hidden="true">
      <defs>
        <radialGradient id="glow-move" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#5ad1ff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#5ad1ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="54" cy="42" r="34" fill="url(#glow-move)" />
      {[0, 1, 2].map(i => (
        <line key={i} x1={10 + i * 3} y1={34 + i * 9} x2={34 + i * 2} y2={34 + i * 9} stroke="#bfefff" strokeWidth="2.5" strokeLinecap="round" />
      ))}
      <path d="M44 18 L58 18 L58 46 L74 52 Q80 56 76 62 L42 62 Z" fill="#7a4a2a" stroke="#f2c14e" strokeWidth="2" strokeLinejoin="round" />
      <path d="M58 24 Q74 10 88 14 Q78 20 82 24 Q72 24 74 30 Q66 28 58 32 Z" fill="#f4f1e8" stroke="#bfa36a" strokeWidth="1.2" />
      <rect x="42" y="60" width="36" height="4" rx="2" fill="#f2c14e" />
    </svg>
  );
};

export const GambitCard: React.FC<GambitCardProps> = ({ card, canAfford, onPlay, active = false }) => {
  return (
    <button
      type="button"
      className={`gambit-card ${canAfford ? 'affordable' : 'unaffordable'} type-${card.type} ${active ? 'active' : ''}`}
      onClick={() => canAfford && onPlay(card)}
      disabled={!canAfford}
      title={canAfford ? `Play ${card.name}` : `Needs ${card.cost} GP`}
    >
      <div className="card-header">
        <span className="card-title">{card.name}</span>
        <span className="card-cost">{card.cost}<small>GP</small></span>
      </div>

      <div className="card-art">
        <CardArt type={card.type} />
      </div>

      <div className="card-body">
        <p>{card.description}</p>
      </div>

      <div className="card-footer">
        <span className="card-type-label">{card.type.toUpperCase()}</span>
      </div>
    </button>
  );
};
