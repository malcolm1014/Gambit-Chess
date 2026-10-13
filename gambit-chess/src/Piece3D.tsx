import React, { useMemo } from 'react';
import type { Piece as PieceType } from './types';
import * as THREE from 'three';

interface Piece3DProps {
  piece: PieceType;
}

const materialProps = {
  white: { color: '#fcfcfc', roughness: 0.15, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.1 },
  black: { color: '#1a1a1a', roughness: 0.2, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.2 }
};

// Helper function to generate a LatheGeometry from an array of [x, y] points
const createProfileGeometry = (points: [number, number][]) => {
  const vectorPoints = points.map(p => new THREE.Vector2(p[0], p[1]));
  return new THREE.LatheGeometry(vectorPoints, 32);
};

export const Piece3D: React.FC<Piece3DProps> = ({ piece }) => {
  const mat = materialProps[piece.color];
  const Material = () => <meshPhysicalMaterial {...mat} />;

  // Pre-compute geometries so we don't recreate them every render frame
  const pawnGeom = useMemo(() => createProfileGeometry([
    [0.00, 0.0], [0.35, 0.0], [0.35, 0.1], [0.30, 0.15], [0.28, 0.2],
    [0.22, 0.4], [0.15, 0.6], [0.18, 0.65], [0.18, 0.7], [0.10, 0.75],
    [0.22, 0.9], [0.15, 1.1], [0.00, 1.1]
  ]), []);

  const rookGeom = useMemo(() => createProfileGeometry([
    [0.00, 0.0], [0.38, 0.0], [0.38, 0.15], [0.32, 0.2], [0.28, 0.5],
    [0.26, 0.7], [0.35, 0.8], [0.35, 1.0], [0.28, 1.0], [0.28, 0.9], [0.00, 0.9]
  ]), []);

  const bishopGeom = useMemo(() => createProfileGeometry([
    [0.00, 0.0], [0.35, 0.0], [0.35, 0.1], [0.30, 0.15], [0.25, 0.2],
    [0.15, 0.6], [0.18, 0.7], [0.22, 0.75], [0.22, 0.8], [0.10, 0.85],
    [0.20, 1.0], [0.10, 1.25], [0.02, 1.3], [0.05, 1.35], [0.00, 1.4]
  ]), []);

  const queenGeom = useMemo(() => createProfileGeometry([
    [0.00, 0.0], [0.40, 0.0], [0.40, 0.15], [0.35, 0.2], [0.30, 0.25],
    [0.20, 0.7], [0.25, 0.8], [0.30, 0.85], [0.30, 0.9], [0.15, 0.95],
    [0.35, 1.2], [0.35, 1.3], [0.25, 1.35], [0.10, 1.3], [0.00, 1.3]
  ]), []);

  const kingGeom = useMemo(() => createProfileGeometry([
    [0.00, 0.0], [0.42, 0.0], [0.42, 0.15], [0.38, 0.2], [0.32, 0.25],
    [0.22, 0.7], [0.28, 0.8], [0.35, 0.85], [0.35, 0.9], [0.20, 0.95],
    [0.30, 1.2], [0.30, 1.35], [0.15, 1.45], [0.00, 1.45]
  ]), []);

  const knightBaseGeom = useMemo(() => createProfileGeometry([
    [0.00, 0.0], [0.38, 0.0], [0.38, 0.15], [0.32, 0.2], [0.28, 0.4], [0.0, 0.4]
  ]), []);

  switch (piece.type) {
    case 'pawn':
      return (
        <mesh geometry={pawnGeom} position={[0, 0.1, 0]}>
          <Material />
        </mesh>
      );
    case 'rook':
      return (
        <group position={[0, 0.1, 0]}>
          <mesh geometry={rookGeom}>
            <Material />
          </mesh>
          {/* Battlements for rook */}
          {[0, 1, 2, 3].map(i => (
            <mesh key={i} position={[Math.cos(i * Math.PI/2) * 0.25, 1.05, Math.sin(i * Math.PI/2) * 0.25]}>
              <boxGeometry args={[0.15, 0.1, 0.15]} />
              <Material />
            </mesh>
          ))}
        </group>
      );
    case 'knight':
      return (
        <group position={[0, 0.1, 0]}>
          <mesh geometry={knightBaseGeom}>
            <Material />
          </mesh>
          {/* A more sculpted knight head using primitive groups */}
          <group position={[0, 0.6, 0]}>
            {/* Neck */}
            <mesh position={[0, 0, 0]} rotation={[0, 0, 0.2]}>
              <cylinderGeometry args={[0.15, 0.22, 0.5, 16]} />
              <Material />
            </mesh>
            {/* Snout */}
            <mesh position={[0, 0.25, 0.15]} rotation={[0.4, 0, 0]}>
              <cylinderGeometry args={[0.1, 0.18, 0.45, 16]} />
              <Material />
            </mesh>
            {/* Ears */}
            <mesh position={[-0.1, 0.35, -0.1]} rotation={[-0.2, 0, 0.2]}>
              <coneGeometry args={[0.05, 0.2, 8]} />
              <Material />
            </mesh>
            <mesh position={[0.1, 0.35, -0.1]} rotation={[-0.2, 0, -0.2]}>
              <coneGeometry args={[0.05, 0.2, 8]} />
              <Material />
            </mesh>
          </group>
        </group>
      );
    case 'bishop':
      return (
        <group position={[0, 0.1, 0]}>
          <mesh geometry={bishopGeom}>
            <Material />
          </mesh>
          {/* Mitre cut (approximation using a subtractive-looking box or simply a sphere on top) */}
          <mesh position={[0, 1.45, 0]}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <Material />
          </mesh>
        </group>
      );
    case 'queen':
      return (
        <group position={[0, 0.1, 0]}>
          <mesh geometry={queenGeom}>
            <Material />
          </mesh>
          <mesh position={[0, 1.4, 0]}>
            <sphereGeometry args={[0.12, 16, 16]} />
            <Material />
          </mesh>
        </group>
      );
    case 'king':
      return (
        <group position={[0, 0.1, 0]}>
          <mesh geometry={kingGeom}>
            <Material />
          </mesh>
          {/* Cross */}
          <group position={[0, 1.6, 0]}>
            <mesh>
              <boxGeometry args={[0.08, 0.3, 0.08]} />
              <Material />
            </mesh>
            <mesh position={[0, 0.05, 0]}>
              <boxGeometry args={[0.25, 0.08, 0.08]} />
              <Material />
            </mesh>
          </group>
        </group>
      );
    default:
      return null;
  }
};
