import React from 'react';
import type { GameState, Piece } from './types';

interface BoardProps {
  gameState: GameState;
  onSquareClick: (row: number, col: number) => void;
  selectedSquare: { row: number; col: number } | null;
}

const pieceUnicode: Record<string, Record<string, string>> = {
  white: {
    king: '♔',
    queen: '♕',
    rook: '♖',
    bishop: '♗',
    knight: '♘',
    pawn: '♙'
  },
  black: {
    king: '♚',
    queen: '♛',
    rook: '♜',
    bishop: '♝',
    knight: '♞',
    pawn: '♟'
  }
};

export const Board: React.FC<BoardProps> = ({ gameState, onSquareClick, selectedSquare }) => {
  return (
    <div className="board">
      {gameState.board.map((row, rowIndex) => (
        row.map((square, colIndex) => {
          const isLight = (rowIndex + colIndex) % 2 === 0;
          const isSelected = selectedSquare?.row === rowIndex && selectedSquare?.col === colIndex;

          return (
            <div
              key={square.id}
              className={`square ${isLight ? 'light' : 'dark'} ${isSelected ? 'selected' : ''}`}
              onClick={() => onSquareClick(rowIndex, colIndex)}
            >
              {square.piece && (
                <span className="piece" title={`O:${square.piece.baseOffense + square.piece.modOffense} D:${square.piece.baseDefense + square.piece.modDefense}`}>
                  {pieceUnicode[square.piece.color][square.piece.type]}
                </span>
              )}
            </div>
          );
        })
      ))}
    </div>
  );
};
