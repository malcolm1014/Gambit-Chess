import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import type { GameState, Piece, PlayerColor } from './types';
import { Piece3D } from './Piece3D';

type Pos = { row: number; col: number };

interface Board3DProps {
  gameState: GameState;
  onSquareClick: (row: number, col: number) => void;
  selectedSquare: Pos | null;
  legalTargets?: Pos[];              // squares the selected piece can move to
  trapViewer?: PlayerColor | null;   // whose hidden traps to reveal (null = none)
}

// ---- Palette: torch-lit dungeon stone ----
const LIGHT_STONE = '#c9b48a';
const DARK_STONE = '#4a4352';
const GOLD = '#d4a937';

// A flickering torch: point light + a small glowing flame
const Torch: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const light = useRef<THREE.PointLight>(null);
  const flame = useRef<THREE.Mesh>(null);
  const seed = useMemo(() => Math.random() * 100, []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + seed;
    const flicker = 1 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23) * 0.05;
    if (light.current) light.current.intensity = 6 * flicker;
    if (flame.current) flame.current.scale.setScalar(flicker);
  });
  return (
    <group position={position}>
      {/* Stone pillar */}
      <mesh position={[0, -0.55, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.22, 1.1, 8]} />
        <meshStandardMaterial color="#3a3440" roughness={0.95} />
      </mesh>
      {/* Brazier bowl */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.2, 0.1, 0.15, 12]} />
        <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.35} />
      </mesh>
      {/* Flame */}
      <mesh ref={flame} position={[0, 0.25, 0]}>
        <coneGeometry args={[0.1, 0.35, 10]} />
        <meshBasicMaterial color="#ffb347" toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 0.4, 0]} color="#ff9a3c" distance={9} decay={1.6} castShadow={false} />
    </group>
  );
};

// Pulsing glowing ring on a square (selection, legal move, trap)
const GlowRing: React.FC<{ color: string; inner?: number; outer?: number; pulse?: boolean; y?: number }> = ({
  color, inner = 0.36, outer = 0.46, pulse = true, y = 0.012,
}) => {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (pulse && mat.current) mat.current.opacity = 0.55 + Math.sin(clock.getElapsedTime() * 4) * 0.3;
  });
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[inner, outer, 48]} />
      <meshBasicMaterial ref={mat} color={color} transparent opacity={0.8} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
};

// Hidden trap: a slowly turning red rune circle, only shown to its owner
const TrapRune: React.FC = () => {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (g.current) g.current.rotation.y += dt * 0.8; });
  return (
    <group ref={g} position={[0, 0.014, 0]}>
      <GlowRing color="#ff2d55" inner={0.3} outer={0.38} />
      {[0, 1, 2].map(i => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, (i * Math.PI) / 3]}>
          <planeGeometry args={[0.6, 0.05]} />
          <meshBasicMaterial color="#ff2d55" transparent opacity={0.7} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
};

// A piece that glides to its new square instead of teleporting
const AnimatedPiece: React.FC<{ piece: Piece; pos: Pos; selected: boolean; onClick: () => void }> = ({ piece, pos, selected, onClick }) => {
  const ref = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(pos.col, 0, pos.row), [pos.col, pos.row]);
  const first = useRef(true);
  // Let every mesh in the piece cast a shadow (re-run if a pawn promotes)
  useEffect(() => {
    ref.current?.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m.material as THREE.Material).transparent) m.castShadow = true;
    });
  }, [piece.type, piece.tempOffense]);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    if (first.current) { g.position.copy(target); first.current = false; }
    const dist = Math.hypot(g.position.x - target.x, g.position.z - target.z);
    g.position.x = THREE.MathUtils.damp(g.position.x, target.x, 9, dt);
    g.position.z = THREE.MathUtils.damp(g.position.z, target.z, 9, dt);
    // Small hop while travelling, gentle hover when selected
    const hover = selected ? 0.15 + Math.sin(performance.now() / 300) * 0.05 : 0;
    g.position.y = THREE.MathUtils.damp(g.position.y, Math.min(dist, 1) * 0.6 + hover, 12, dt);
  });
  return (
    <group
      ref={ref}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = 'auto'; }}
    >
      <Piece3D piece={piece} />
    </group>
  );
};

export const Board3D: React.FC<Board3DProps> = ({ gameState, onSquareClick, selectedSquare, legalTargets = [], trapViewer = null }) => {
  const targetKey = new Set(legalTargets.map(t => `${t.row},${t.col}`));

  const pieces: { piece: Piece; pos: Pos }[] = [];
  gameState.board.forEach((row, r) => row.forEach((sq, c) => { if (sq.piece) pieces.push({ piece: sq.piece, pos: { row: r, col: c } }); }));

  return (
    <div className="board-container">
      <Canvas shadows camera={{ position: [0, 7.5, 7.8], fov: 42 }} dpr={[1, 2]}>
        <color attach="background" args={['#0d0a12']} />
        <fog attach="fog" args={['#0d0a12', 14, 26]} />

        <ambientLight intensity={0.35} color="#b9a7ff" />
        <directionalLight
          position={[4, 10, 3]}
          intensity={1.1}
          color="#ffe2b8"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
        />
        <directionalLight position={[-6, 4, -4]} intensity={0.4} color="#7f6bff" />
        <Environment preset="night" />

        <OrbitControls
          enablePan={false}
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2.3}
          minDistance={6}
          maxDistance={16}
        />

        {/* Floating magic dust */}
        <Sparkles count={70} scale={[11, 3, 11]} position={[0, 1.6, 0]} size={2.2} speed={0.25} color="#ffd27a" opacity={0.6} />

        {/* Torches at the four corners */}
        <Torch position={[-4.9, 0.6, -4.9]} />
        <Torch position={[4.9, 0.6, -4.9]} />
        <Torch position={[-4.9, 0.6, 4.9]} />
        <Torch position={[4.9, 0.6, 4.9]} />

        <group position={[-3.5, 0, -3.5]}>
          {gameState.board.map((row, rowIndex) =>
            row.map((square, colIndex) => {
              const isLight = (rowIndex + colIndex) % 2 === 0;
              const isSelected = selectedSquare?.row === rowIndex && selectedSquare?.col === colIndex;
              const isTarget = targetKey.has(`${rowIndex},${colIndex}`);
              const isCaptureTarget = isTarget && !!square.piece;
              const showTrap = !!square.trap && trapViewer !== null && square.trap.owner === trapViewer;

              return (
                <group key={square.id} position={[colIndex, 0, rowIndex]}>
                  {/* Stone tile (slightly inset so the grout lines show) */}
                  <mesh
                    position={[0, -0.1, 0]}
                    onClick={(e) => { e.stopPropagation(); onSquareClick(rowIndex, colIndex); }}
                    receiveShadow
                  >
                    <boxGeometry args={[0.97, 0.2, 0.97]} />
                    <meshStandardMaterial
                      color={isLight ? LIGHT_STONE : DARK_STONE}
                      roughness={isLight ? 0.75 : 0.6}
                      metalness={isLight ? 0.05 : 0.15}
                      emissive={isSelected ? '#ffb703' : '#000000'}
                      emissiveIntensity={isSelected ? 0.35 : 0}
                    />
                  </mesh>

                  {isSelected && <GlowRing color="#ffd166" />}
                  {isTarget && !isCaptureTarget && (
                    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                      <circleGeometry args={[0.13, 24]} />
                      <meshBasicMaterial color="#7cf5c4" transparent opacity={0.85} toneMapped={false} />
                    </mesh>
                  )}
                  {isCaptureTarget && <GlowRing color="#ff4d4d" inner={0.4} outer={0.48} />}
                  {showTrap && <TrapRune />}
                </group>
              );
            })
          )}

          {/* Pieces live outside the tiles so they can glide between squares */}
          {pieces.map(({ piece, pos }) => (
            <AnimatedPiece
              key={piece.id}
              piece={piece}
              pos={pos}
              selected={selectedSquare?.row === pos.row && selectedSquare?.col === pos.col}
              onClick={() => onSquareClick(pos.row, pos.col)}
            />
          ))}
        </group>

        {/* Carved stone frame with gold trim */}
        <mesh position={[0, -0.28, 0]} receiveShadow castShadow>
          <boxGeometry args={[8.9, 0.36, 8.9]} />
          <meshStandardMaterial color="#2b2531" roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.095, 0]}>
          <boxGeometry args={[8.2, 0.02, 8.2]} />
          <meshStandardMaterial color={GOLD} metalness={0.9} roughness={0.3} />
        </mesh>
        {/* Dais under the board */}
        <mesh position={[0, -0.6, 0]} receiveShadow>
          <cylinderGeometry args={[7.4, 7.8, 0.3, 48]} />
          <meshStandardMaterial color="#1c1722" roughness={1} />
        </mesh>

        <ContactShadows position={[0, -0.44, 0]} opacity={0.6} scale={20} blur={2.5} far={4} />
      </Canvas>
    </div>
  );
};
