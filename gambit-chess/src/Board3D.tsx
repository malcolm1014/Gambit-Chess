import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import type { GameState, Piece, PlayerColor } from './types';
import { Piece3D } from './Piece3D';
import type { BoardTheme } from './Piece3D';
import { getOffense, getDefense } from './mathLogic';

type Pos = { row: number; col: number };

interface Board3DProps {
  gameState: GameState;
  onSquareClick: (row: number, col: number) => void;
  selectedSquare: Pos | null;
  legalTargets?: Pos[];              // squares the selected piece can move to
  trapViewer?: PlayerColor | null;   // whose hidden traps to reveal (null = none)
  theme?: BoardTheme;                // 'classic' tournament board or 'fantasy' dungeon
}

// Classic tournament board colours (maple and walnut)
const CLASSIC_LIGHT = '#f0d9b5';
const CLASSIC_DARK = '#b58863';
const CLASSIC_FRAME = '#5b3a21';

// Coordinate label (a–h, 1–8) drawn onto a small canvas texture
const Label: React.FC<{ text: string; position: [number, number, number]; color: string }> = ({ text, position, color }) => {
  const texture = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.font = 'bold 84px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 70);
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4;
    return t;
  }, [text, color]);
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.34, 0.34]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
};

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

// Height of each piece's top, so the stat tag floats just above its head
const PIECE_TOP: Record<string, number> = { pawn: 1.25, rook: 1.25, knight: 1.5, bishop: 1.65, queen: 1.85, king: 2.1 };

// Floating Offense / Defense tag above a piece. A sprite always faces the camera.
const StatTag: React.FC<{ piece: Piece }> = ({ piece }) => {
  const off = getOffense(piece), def = getDefense(piece);
  const rallied = !!piece.tempOffense;
  const texture = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 96;
    const ctx = cv.getContext('2d')!;
    const pill = (x: number, fill: string, stroke: string, text: string) => {
      ctx.beginPath();
      ctx.roundRect(x, 10, 118, 76, 30);
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = stroke; ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x + 59, 50);
    };
    const fmt = (n: number) => (n === Infinity ? '∞' : String(n));
    pill(6, rallied ? '#c46a00' : '#9b1c1c', rallied ? '#ffd166' : '#f2a3a3', '⚔' + fmt(off));
    pill(132, '#1c4f9b', '#a3c4f2', '🛡' + fmt(def));
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [off, def, rallied]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={[0, PIECE_TOP[piece.type] + 0.3, 0]} scale={[0.82, 0.31, 1]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  );
};

// A piece that glides to its new square instead of teleporting
const AnimatedPiece: React.FC<{ piece: Piece; pos: Pos; selected: boolean; onClick: () => void; theme: BoardTheme; showStats: boolean }> = ({ piece, pos, selected, onClick, theme, showStats }) => {
  const ref = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(pos.col, 0, pos.row), [pos.col, pos.row]);
  const first = useRef(true);
  // Let every mesh in the piece cast a shadow (re-run if a pawn promotes)
  useEffect(() => {
    ref.current?.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m.material as THREE.Material).transparent) m.castShadow = true;
    });
  }, [piece.type, piece.tempOffense, theme]);
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
      <Piece3D piece={piece} theme={theme} />
      {showStats && piece.type !== 'king' && <StatTag piece={piece} />}
    </group>
  );
};

export const Board3D: React.FC<Board3DProps> = ({ gameState, onSquareClick, selectedSquare, legalTargets = [], trapViewer = null, theme = 'classic' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<any>(null);
  const [isFull, setIsFull] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const classic = theme === 'classic';

  useEffect(() => {
    const onChange = () => setIsFull(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.()?.catch(() => {});
  };

  const targetKey = new Set(legalTargets.map(t => `${t.row},${t.col}`));

  const pieces: { piece: Piece; pos: Pos }[] = [];
  gameState.board.forEach((row, r) => row.forEach((sq, c) => { if (sq.piece) pieces.push({ piece: sq.piece, pos: { row: r, col: c } }); }));

  return (
    <div className={`board-container ${isFull ? 'is-full' : ''}`} ref={containerRef}>
      <div className="board-controls">
        <button type="button" onClick={() => setShowStats(v => !v)} title="Show or hide each piece's Offense / Defense">{showStats ? '⚔ Hide stats' : '⚔ Show stats'}</button>
        <button type="button" onClick={() => controlsRef.current?.reset()} title="Reset camera">↺ View</button>
        <button type="button" onClick={toggleFullscreen} title="Full screen">{isFull ? '✕ Exit full screen' : '⛶ Full screen'}</button>
      </div>
      <Canvas shadows camera={{ position: [0, 8.6, 7.4], fov: 40 }} dpr={[1, 2]}>
        {classic ? (
          <>
            <color attach="background" args={['#1b130d']} />
            <hemisphereLight args={['#fff4e0', '#3a2a1c', 0.6]} />
            <directionalLight
              position={[3, 11, 5]} intensity={1.6} color="#fff1dc" castShadow
              shadow-mapSize-width={2048} shadow-mapSize-height={2048}
              shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6}
            />
            <directionalLight position={[-5, 6, -4]} intensity={0.35} color="#ffe2c0" />
            {/* Reflections load in the background so the board appears immediately */}
            <Suspense fallback={null}><Environment preset="apartment" /></Suspense>
          </>
        ) : (
          <>
            <color attach="background" args={['#0d0a12']} />
            <fog attach="fog" args={['#0d0a12', 14, 26]} />
            <ambientLight intensity={0.35} color="#b9a7ff" />
            <directionalLight
              position={[4, 10, 3]} intensity={1.1} color="#ffe2b8" castShadow
              shadow-mapSize-width={2048} shadow-mapSize-height={2048}
              shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6}
            />
            <directionalLight position={[-6, 4, -4]} intensity={0.4} color="#7f6bff" />
            {/* Reflections load in the background so the board appears immediately */}
            <Suspense fallback={null}><Environment preset="night" /></Suspense>
            <Sparkles count={70} scale={[11, 3, 11]} position={[0, 1.6, 0]} size={2.2} speed={0.25} color="#ffd27a" opacity={0.6} />
            <Torch position={[-4.9, 0.6, -4.9]} />
            <Torch position={[4.9, 0.6, -4.9]} />
            <Torch position={[-4.9, 0.6, 4.9]} />
            <Torch position={[4.9, 0.6, 4.9]} />
          </>
        )}

        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2.3}
          minDistance={6}
          maxDistance={18}
        />

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
                  <mesh
                    position={[0, -0.1, 0]}
                    onClick={(e) => { e.stopPropagation(); onSquareClick(rowIndex, colIndex); }}
                    receiveShadow
                  >
                    {/* Classic squares sit flush; fantasy stones leave gold grout lines */}
                    <boxGeometry args={classic ? [1, 0.2, 1] : [0.97, 0.2, 0.97]} />
                    <meshStandardMaterial
                      color={classic ? (isLight ? CLASSIC_LIGHT : CLASSIC_DARK) : (isLight ? LIGHT_STONE : DARK_STONE)}
                      roughness={classic ? 0.45 : (isLight ? 0.75 : 0.6)}
                      metalness={classic ? 0 : (isLight ? 0.05 : 0.15)}
                      emissive={isSelected ? '#ffb703' : '#000000'}
                      emissiveIntensity={isSelected ? (classic ? 0.25 : 0.35) : 0}
                    />
                  </mesh>

                  {isSelected && <GlowRing color={classic ? '#f6c344' : '#ffd166'} pulse={!classic} />}
                  {isTarget && !isCaptureTarget && (
                    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                      <circleGeometry args={[0.14, 24]} />
                      <meshBasicMaterial color={classic ? '#2f6b3a' : '#7cf5c4'} transparent opacity={classic ? 0.55 : 0.85} toneMapped={false} />
                    </mesh>
                  )}
                  {isCaptureTarget && <GlowRing color={classic ? '#c0392b' : '#ff4d4d'} inner={0.4} outer={0.48} pulse={!classic} />}
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
              theme={theme}
              showStats={showStats}
              selected={selectedSquare?.row === pos.row && selectedSquare?.col === pos.col}
              onClick={() => onSquareClick(pos.row, pos.col)}
            />
          ))}
        </group>

        {/* Coordinates around the board, read from White's side */}
        {'abcdefgh'.split('').map((f, i) => (
          <React.Fragment key={f}>
            <Label text={f} position={[i - 3.5, 0.002, 4.24]} color={classic ? '#f0d9b5' : '#d4a937'} />
            <Label text={f} position={[i - 3.5, 0.002, -4.24]} color={classic ? '#f0d9b5' : '#d4a937'} />
          </React.Fragment>
        ))}
        {[8, 7, 6, 5, 4, 3, 2, 1].map((n, r) => (
          <React.Fragment key={n}>
            <Label text={String(n)} position={[-4.24, 0.002, r - 3.5]} color={classic ? '#f0d9b5' : '#d4a937'} />
            <Label text={String(n)} position={[4.24, 0.002, r - 3.5]} color={classic ? '#f0d9b5' : '#d4a937'} />
          </React.Fragment>
        ))}

        {classic ? (
          <>
            {/* Walnut frame with a thin inlay, on a wooden table */}
            <mesh position={[0, -0.115, 0]} receiveShadow castShadow>
              <boxGeometry args={[9.1, 0.22, 9.1]} />
              <meshPhysicalMaterial color={CLASSIC_FRAME} roughness={0.35} clearcoat={0.6} clearcoatRoughness={0.25} />
            </mesh>
            <mesh position={[0, -0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[5.72, 5.8, 4, 1, Math.PI / 4]} />
              <meshBasicMaterial color="#d8b47a" />
            </mesh>
            <mesh position={[0, -0.24, 0]} receiveShadow>
              <boxGeometry args={[30, 0.04, 30]} />
              <meshStandardMaterial color="#3a2616" roughness={0.7} />
            </mesh>
            <ContactShadows position={[0, -0.215, 0]} opacity={0.55} scale={20} blur={2.5} far={4} />
          </>
        ) : (
          <>
            {/* Carved stone frame with gold trim */}
            <mesh position={[0, -0.28, 0]} receiveShadow castShadow>
              <boxGeometry args={[8.9, 0.36, 8.9]} />
              <meshStandardMaterial color="#2b2531" roughness={0.9} />
            </mesh>
            <mesh position={[0, -0.095, 0]}>
              <boxGeometry args={[8.2, 0.02, 8.2]} />
              <meshStandardMaterial color={GOLD} metalness={0.9} roughness={0.3} />
            </mesh>
            <mesh position={[0, -0.6, 0]} receiveShadow>
              <cylinderGeometry args={[7.4, 7.8, 0.3, 48]} />
              <meshStandardMaterial color="#1c1722" roughness={1} />
            </mesh>
            <ContactShadows position={[0, -0.44, 0]} opacity={0.6} scale={20} blur={2.5} far={4} />
          </>
        )}
      </Canvas>
    </div>
  );
};
