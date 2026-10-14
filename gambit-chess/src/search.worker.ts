// Runs the search engine off the main thread so the 3D board stays smooth
import { planComputerTurn } from './ai';
import type { GameState } from './types';
import type { Difficulty } from './search';

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<{ id: number; state: GameState; level: Difficulty }>) => {
  const { id, state, level } = e.data;
  const result = planComputerTurn(state, level);
  ctx.postMessage({ id, ...result });
};
