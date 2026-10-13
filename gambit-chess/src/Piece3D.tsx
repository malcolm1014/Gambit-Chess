import React from 'react';
import type { Piece as PieceType } from './types';

interface Piece3DProps {
  piece: PieceType;
}

const materialProps = {
  white: { color: '#f0f0f0', roughness: 0.3, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.2 },
  black: { color: '#222222', roughness: 0.4, metalness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.3 }
};

export const Piece3D: React.FC<Piece3DProps> = ({ piece }) => {
  const mat = materialProps[piece.color];
  const Material = () => <meshPhysicalMaterial {...mat} />;

  const Base = () => (
    <mesh position={[0, 0.1, 0]}>
      <cylinderGeometry args={[0.35, 0.4, 0.2, 32]} />
      <Material />
    </mesh>
  );

  switch (piece.type) {
    case 'pawn':
      return (
        <group>
          <Base />
          <mesh position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.2, 0.3, 0.4, 32]} />
            <Material />
          </mesh>
          <mesh position={[0, 0.7, 0]}>
            <sphereGeometry args={[0.2, 32, 32]} />
            <Material />
          </mesh>
        </group>
      );
    case 'rook':
      return (
        <group>
          <Base />
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.3, 0.35, 0.6, 32]} />
            <Material />
          </mesh>
          <mesh position={[0, 0.85, 0]}>
            <cylinderGeometry args={[0.35, 0.35, 0.1, 8]} />
            <Material />
          </mesh>
        </group>
      );
    case 'knight':
      return (
        <group>
          <Base />
          <mesh position={[0, 0.5, 0]} rotation={[0.2, 0, 0]}>
             {/* Approximate horse head with a box/cylinder combo for simplicity without loading external models */}
            <boxGeometry args={[0.3, 0.6, 0.5]} />
            <Material />
          </mesh>
          <mesh position={[0, 0.8, 0.1]} rotation={[-0.4, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.2, 0.4]} />
            <Material />
          </mesh>
        </group>
      );
    case 'bishop':
      return (
        <group>
          <Base />
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.15, 0.3, 0.6, 32]} />
            <Material />
          </mesh>
          <mesh position={[0, 0.9, 0]}>
            <sphereGeometry args={[0.18, 32, 32]} />
            <Material />
          </mesh>
          <mesh position={[0, 1.1, 0]}>
            <sphereGeometry args={[0.05, 16, 16]} />
            <Material />
          </mesh>
        </group>
      );
    case 'queen':
      return (
        <group>
          <Base />
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.2, 0.35, 0.8, 32]} />
            <Material />
          </mesh>
          <mesh position={[0, 1.0, 0]}>
            <cylinderGeometry args={[0.3, 0.15, 0.2, 32]} />
            <Material />
          </mesh>
          <mesh position={[0, 1.15, 0]}>
            <sphereGeometry args={[0.1, 16, 16]} />
            <Material />
          </mesh>
        </group>
      );
    case 'king':
      return (
        <group>
          <Base />
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.25, 0.35, 0.8, 32]} />
            <Material />
          </mesh>
          <mesh position={[0, 1.05, 0]}>
            <cylinderGeometry args={[0.35, 0.2, 0.1, 32]} />
            <Material />
          </mesh>
          {/* Cross */}
          <mesh position={[0, 1.25, 0]}>
            <boxGeometry args={[0.1, 0.3, 0.1]} />
            <Material />
          </mesh>
          <mesh position={[0, 1.25, 0]}>
            <boxGeometry args={[0.25, 0.1, 0.1]} />
            <Material />
          </mesh>
        </group>
      );
    default:
      return null;
  }
};
