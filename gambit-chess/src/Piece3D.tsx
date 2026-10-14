import React, { useMemo } from 'react';
import type { Piece as PieceType } from './types';
import * as THREE from 'three';

interface Piece3DProps {
  piece: PieceType;
}

const materialProps = {
  white: {
    color: '#fffff5',
    roughness: 0.1,
    metalness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    transmission: 0.1,
    ior: 1.5,
    thickness: 1.0
  },
  black: {
    color: '#111111',
    roughness: 0.2,
    metalness: 0.6,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2
  }
};

// Helper function to generate a LatheGeometry from an array of [x, y] points
// Increased segments for a smoother, more realistic curve
const createProfileGeometry = (points: [number, number][]) => {
  const vectorPoints = points.map(p => new THREE.Vector2(p[0], p[1]));
  return new THREE.LatheGeometry(vectorPoints, 64);
};

export const Piece3D: React.FC<Piece3DProps> = ({ piece }) => {
  const mat = materialProps[piece.color];
  const Material = () => <meshPhysicalMaterial {...mat} />;

  // Pre-compute geometries with highly refined, realistic chess profiles (Staunton style)
  const pawnGeom = useMemo(() => createProfileGeometry([
    [0.00, 0.00], [0.35, 0.00], [0.35, 0.08], [0.30, 0.12], [0.28, 0.16],
    [0.24, 0.35], [0.18, 0.55], [0.22, 0.62], [0.22, 0.68], [0.12, 0.72],
    [0.24, 0.88], [0.22, 1.02], [0.12, 1.15], [0.00, 1.15]
  ]), []);

  const rookGeom = useMemo(() => createProfileGeometry([
    [0.00, 0.00], [0.42, 0.00], [0.42, 0.12], [0.36, 0.18], [0.32, 0.40],
    [0.30, 0.70], [0.38, 0.80], [0.40, 0.95], [0.38, 1.10], [0.28, 1.10],
    [0.28, 1.00], [0.00, 1.00]
  ]), []);

  const bishopGeom = useMemo(() => createProfileGeometry([
    [0.00, 0.00], [0.40, 0.00], [0.40, 0.10], [0.34, 0.16], [0.28, 0.22],
    [0.18, 0.50], [0.20, 0.65], [0.26, 0.72], [0.26, 0.78], [0.12, 0.84],
    [0.22, 1.00], [0.18, 1.20], [0.05, 1.40], [0.06, 1.45], [0.00, 1.50]
  ]), []);

  const queenGeom = useMemo(() => createProfileGeometry([
    [0.00, 0.00], [0.45, 0.00], [0.45, 0.12], [0.38, 0.20], [0.32, 0.28],
    [0.22, 0.70], [0.28, 0.85], [0.34, 0.92], [0.34, 0.98], [0.18, 1.05],
    [0.38, 1.30], [0.38, 1.45], [0.28, 1.55], [0.15, 1.45], [0.00, 1.45]
  ]), []);

  const kingGeom = useMemo(() => createProfileGeometry([
    [0.00, 0.00], [0.48, 0.00], [0.48, 0.15], [0.40, 0.22], [0.34, 0.30],
    [0.26, 0.75], [0.32, 0.88], [0.40, 0.95], [0.40, 1.02], [0.22, 1.10],
    [0.35, 1.35], [0.35, 1.55], [0.18, 1.65], [0.00, 1.65]
  ]), []);

  const knightBaseGeom = useMemo(() => createProfileGeometry([
    [0.00, 0.00], [0.42, 0.00], [0.42, 0.12], [0.36, 0.20], [0.30, 0.45], [0.0, 0.45]
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
