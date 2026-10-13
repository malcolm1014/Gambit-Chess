import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import type { GameState } from './types';

interface Board3DProps {
  gameState: GameState;
  onSquareClick: (row: number, col: number) => void;
  selectedSquare: { row: number; col: number } | null;
}

const pieceUnicode: Record<string, Record<string, string>> = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
};

export const Board3D: React.FC<Board3DProps> = ({ gameState, onSquareClick, selectedSquare }) => {
  return (
    <div style={{ width: '600px', height: '600px', border: '4px solid #000', backgroundColor: '#87CEEB' }}>
      <Canvas camera={{ position: [0, 8, 10], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <OrbitControls enablePan={false} minPolarAngle={Math.PI / 6} maxPolarAngle={Math.PI / 2.5} />

        <group position={[-3.5, 0, -3.5]}>
          {gameState.board.map((row, rowIndex) => (
            row.map((square, colIndex) => {
              const isLight = (rowIndex + colIndex) % 2 === 0;
              const isSelected = selectedSquare?.row === rowIndex && selectedSquare?.col === colIndex;
              const color = isSelected ? '#ffff00' : isLight ? '#ffce9e' : '#d18b47';

              // Map board coords to 3D space
              // WebGL coordinates: X is right, Y is up, Z is toward the camera (negative is away)
              const xPos = colIndex;
              const zPos = rowIndex;

              return (
                <group key={square.id} position={[xPos, 0, zPos]}>
                  {/* Square */}
                  <mesh
                    position={[0, -0.25, 0]}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSquareClick(rowIndex, colIndex);
                    }}
                  >
                    <boxGeometry args={[1, 0.5, 1]} />
                    <meshStandardMaterial color={color} />
                  </mesh>

                  {/* Piece */}
                  {square.piece && (
                    <Text
                      position={[0, 0.5, 0]}
                      fontSize={0.8}
                      color="#000"
                      rotation={[-Math.PI / 2, 0, 0]}
                      outlineWidth={0.02}
                      outlineColor="#ffffff"
                    >
                      {pieceUnicode[square.piece.color][square.piece.type]}
                    </Text>
                  )}
                </group>
              );
            })
          ))}
        </group>
      </Canvas>
    </div>
  );
};
