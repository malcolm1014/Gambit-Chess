import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Piece as PieceType, PlayerColor } from './types';
import * as THREE from 'three';

interface Piece3DProps {
  piece: PieceType;
}

// Fantasy materials: the Light side is carved ivory, the Dark side is obsidian
// with a faint ember glow.
const materialProps = {
  white: {
    color: '#f3e7cf',
    roughness: 0.35,
    metalness: 0.05,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
    sheen: 0.4,
    sheenColor: '#fff4d6',
  },
  black: {
    color: '#1a1420',
    roughness: 0.18,
    metalness: 0.55,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    emissive: '#3a0a12',
    emissiveIntensity: 0.35,
  }
};

// Team colours for trims, gems and the glowing rune under each piece
const TEAM = {
  white: { trim: '#d4a937', gem: '#4fc3ff', rune: '#ffd166' },
  black: { trim: '#8f8f9c', gem: '#ff3355', rune: '#ff3355' },
};

// Glowing team rune under every piece (+ an orange aura when Rally is active)
const RuneBase: React.FC<{ color: PlayerColor; rallied: boolean }> = ({ color, rallied }) => {
  const aura = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (aura.current) aura.current.opacity = 0.35 + Math.sin(clock.getElapsedTime() * 6) * 0.2;
  });
  return (
    <>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.36, 0.42, 40]} />
        <meshBasicMaterial color={TEAM[color].rune} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      {rallied && (
        <mesh position={[0, 0.7, 0]}>
          <cylinderGeometry args={[0.42, 0.48, 1.4, 24, 1, true]} />
          <meshBasicMaterial ref={aura} color="#ff8a00" transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </>
  );
};

// Helper function to generate a LatheGeometry from an array of [x, y] points
// Increased segments for a smoother, more realistic curve
const createProfileGeometry = (points: [number, number][]) => {
  const vectorPoints = points.map(p => new THREE.Vector2(p[0], p[1]));
  return new THREE.LatheGeometry(vectorPoints, 64);
};

export const Piece3D: React.FC<Piece3DProps> = ({ piece }) => {
  return (
    <group>
      <RuneBase color={piece.color} rallied={!!piece.tempOffense} />
      <PieceBody piece={piece} />
    </group>
  );
};

// Shared materials/parts (defined at module level so they aren't re-created every render)
const BodyMat: React.FC<{ c: PlayerColor }> = ({ c }) => <meshPhysicalMaterial {...materialProps[c]} />;
const TrimMat: React.FC<{ c: PlayerColor }> = ({ c }) => <meshStandardMaterial color={TEAM[c].trim} metalness={0.9} roughness={0.25} />;
const GemMat: React.FC<{ c: PlayerColor }> = ({ c }) => (
  <meshStandardMaterial color={TEAM[c].gem} emissive={TEAM[c].gem} emissiveIntensity={1.4} toneMapped={false} />
);
// Thin metal band used as a collar on each piece
const TrimBand: React.FC<{ y: number; r: number; c: PlayerColor }> = ({ y, r, c }) => (
  <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
    <torusGeometry args={[r, 0.025, 10, 40]} />
    <TrimMat c={c} />
  </mesh>
);

const PieceBody: React.FC<Piece3DProps> = ({ piece }) => {
  const c = piece.color;

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
        <group position={[0, 0.1, 0]}>
          <mesh geometry={pawnGeom}>
            <BodyMat c={c} />
          </mesh>
          <TrimBand y={0.65} r={0.22} c={c} />
        </group>
      );
    case 'rook':
      return (
        <group position={[0, 0.1, 0]}>
          <mesh geometry={rookGeom}>
            <BodyMat c={c} />
          </mesh>
          <TrimBand y={0.1} r={0.41} c={c} />
          <TrimBand y={0.82} r={0.38} c={c} />
          {/* Battlements for rook */}
          {[0, 1, 2, 3].map(i => (
            <mesh key={i} position={[Math.cos(i * Math.PI/2) * 0.25, 1.05, Math.sin(i * Math.PI/2) * 0.25]}>
              <boxGeometry args={[0.15, 0.1, 0.15]} />
              <BodyMat c={c} />
            </mesh>
          ))}
        </group>
      );
    case 'knight':
      return (
        <group position={[0, 0.1, 0]}>
          <mesh geometry={knightBaseGeom}>
            <BodyMat c={c} />
          </mesh>
          <TrimBand y={0.12} r={0.41} c={c} />
          {/* A more sculpted knight head using primitive groups */}
          <group position={[0, 0.6, 0]}>
            {/* Neck */}
            <mesh position={[0, 0, 0]} rotation={[0, 0, 0.2]}>
              <cylinderGeometry args={[0.15, 0.22, 0.5, 16]} />
              <BodyMat c={c} />
            </mesh>
            {/* Snout */}
            <mesh position={[0, 0.25, 0.15]} rotation={[0.4, 0, 0]}>
              <cylinderGeometry args={[0.1, 0.18, 0.45, 16]} />
              <BodyMat c={c} />
            </mesh>
            {/* Glowing eyes */}
            <mesh position={[-0.09, 0.3, 0.17]}>
              <sphereGeometry args={[0.03, 10, 10]} />
              <GemMat c={c} />
            </mesh>
            <mesh position={[0.09, 0.3, 0.17]}>
              <sphereGeometry args={[0.03, 10, 10]} />
              <GemMat c={c} />
            </mesh>
            {/* Mane */}
            <mesh position={[0, 0.15, -0.13]} rotation={[-0.3, 0, 0]}>
              <boxGeometry args={[0.05, 0.45, 0.12]} />
              <TrimMat c={c} />
            </mesh>
            {/* Ears */}
            <mesh position={[-0.1, 0.35, -0.1]} rotation={[-0.2, 0, 0.2]}>
              <coneGeometry args={[0.05, 0.2, 8]} />
              <BodyMat c={c} />
            </mesh>
            <mesh position={[0.1, 0.35, -0.1]} rotation={[-0.2, 0, -0.2]}>
              <coneGeometry args={[0.05, 0.2, 8]} />
              <BodyMat c={c} />
            </mesh>
          </group>
        </group>
      );
    case 'bishop':
      return (
        <group position={[0, 0.1, 0]}>
          <mesh geometry={bishopGeom}>
            <BodyMat c={c} />
          </mesh>
          <TrimBand y={0.75} r={0.26} c={c} />
          {/* Glowing gem on the mitre */}
          <mesh position={[0, 1.47, 0]}>
            <octahedronGeometry args={[0.09]} />
            <GemMat c={c} />
          </mesh>
        </group>
      );
    case 'queen':
      return (
        <group position={[0, 0.1, 0]}>
          <mesh geometry={queenGeom}>
            <BodyMat c={c} />
          </mesh>
          <TrimBand y={0.95} r={0.34} c={c} />
          {/* Crown points */}
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
            <mesh key={i} position={[Math.cos((i * Math.PI) / 4) * 0.33, 1.6, Math.sin((i * Math.PI) / 4) * 0.33]}>
              <coneGeometry args={[0.05, 0.16, 6]} />
              <TrimMat c={c} />
            </mesh>
          ))}
          <mesh position={[0, 1.55, 0]}>
            <sphereGeometry args={[0.12, 20, 20]} />
            <GemMat c={c} />
          </mesh>
        </group>
      );
    case 'king':
      return (
        <group position={[0, 0.1, 0]}>
          <mesh geometry={kingGeom}>
            <BodyMat c={c} />
          </mesh>
          <TrimBand y={0.98} r={0.4} c={c} />
          {/* Gold cross with a gem at its heart */}
          <group position={[0, 1.8, 0]}>
            <mesh>
              <boxGeometry args={[0.08, 0.34, 0.08]} />
              <TrimMat c={c} />
            </mesh>
            <mesh position={[0, 0.05, 0]}>
              <boxGeometry args={[0.27, 0.08, 0.08]} />
              <TrimMat c={c} />
            </mesh>
            <mesh position={[0, 0.05, 0.05]}>
              <octahedronGeometry args={[0.06]} />
              <GemMat c={c} />
            </mesh>
          </group>
        </group>
      );
    default:
      return null;
  }
};
