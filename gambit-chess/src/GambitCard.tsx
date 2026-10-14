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
}

export const GambitCard: React.FC<GambitCardProps> = ({ card, canAfford, onPlay }) => {
  return (
    <div
      className={`gambit-card ${canAfford ? 'affordable' : 'unaffordable'} type-${card.type}`}
      onClick={() => canAfford && onPlay(card)}
    >
      <div className="card-header">
        <span className="card-title">{card.name}</span>
        <span className="card-cost">{card.cost} GP</span>
      </div>

      <div className="card-art">
         {/* Placeholder for actual 3D/2D art */}
         <div className="art-placeholder" />
      </div>

      <div className="card-body">
        <p>{card.description}</p>
      </div>

      <div className="card-footer">
        <span className="card-type-label">{card.type.toUpperCase()}</span>
      </div>
    </div>
  );
};
