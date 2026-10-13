import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import type { GameState } from './types';
import { Piece3D } from './Piece3D';

interface Board3DProps {
  gameState: GameState;
  onSquareClick: (row: number, col: number) => void;
  selectedSquare: { row: number; col: number } | null;
}

export const Board3D: React.FC<Board3DProps> = ({ gameState, onSquareClick, selectedSquare }) => {
  return (
    <div className="board-container" style={{ width: '100%', height: '600px', backgroundColor: '#0f0f11' }}>
      <Canvas camera={{ position: [0, 6, 8], fov: 45 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 20, 10]} intensity={1.5} castShadow />
        <Environment preset="studio" />
        <OrbitControls
          enablePan={false}
          minPolarAngle={0.1}
          maxPolarAngle={Math.PI / 2.2}
          minDistance={5}
          maxDistance={15}
        />

        <group position={[-3.5, 0, -3.5]}>
          {gameState.board.map((row, rowIndex) => (
            row.map((square, colIndex) => {
              const isLight = (rowIndex + colIndex) % 2 === 0;
              const isSelected = selectedSquare?.row === rowIndex && selectedSquare?.col === colIndex;

              const baseColor = isLight ? '#eeeeee' : '#222222';
              const color = isSelected ? '#4CAF50' : baseColor;

              const xPos = colIndex;
              const zPos = rowIndex;

              return (
                <group key={square.id} position={[xPos, 0, zPos]}>
                  {/* Square */}
                  <mesh
                    position={[0, -0.1, 0]}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSquareClick(rowIndex, colIndex);
                    }}
                    receiveShadow
                  >
                    <boxGeometry args={[1, 0.2, 1]} />
                    <meshPhysicalMaterial
                      color={color}
                      roughness={0.1}
                      metalness={0.1}
                      clearcoat={1.0}
                      clearcoatRoughness={0.1}
                    />
                  </mesh>

                  {/* Piece */}
                  {square.piece && (
                    <group position={[0, 0, 0]}>
                       <Piece3D piece={square.piece} />
                    </group>
                  )}
                </group>
              );
            })
          ))}
        </group>

        {/* Frame around the board */}
        <mesh position={[0, -0.15, 0]}>
          <boxGeometry args={[8.4, 0.3, 8.4]} />
          <meshPhysicalMaterial color="#333" metalness={0.8} roughness={0.2} />
        </mesh>

        <ContactShadows position={[0, -0.3, 0]} opacity={0.7} scale={20} blur={2} far={4} />
      </Canvas>
    </div>
  );
};
