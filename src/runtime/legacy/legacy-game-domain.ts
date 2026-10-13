import { advanceTime, applyCommand, createNewGame, getGameSummary } from '../../domain/engine';
import type {
  GameCommand,
  GameDefinition,
  GameErrorCode,
  GameState,
  GameSummary,
} from '../../domain/types';
import { validateGameDefinition } from '../../domain/validation';
import { decodeSave, encodeSave } from '../../persistence/save-codec';
import type { InstanceLease, SaveStorage } from '../../platform/ports';
import { createConfiguredGameRuntime, type GameRuntime, type RuntimeDomain } from '../game-runtime';

/**
 * 旧 0.8.0 规则与旧存档编解码对通用 Runtime 的适配层。
 * 通用生命周期（单动作队列 / 单保存队列 / 启动补算与屏障）在 `runtime/game-runtime.ts`，与域无关；
 * 这里只提供旧域的接线，随 `core-partition` 归入 `runtime/legacy/`。
 */
export const LEGACY_GAME_RUNTIME_DOMAIN: RuntimeDomain<
  GameDefinition,
  GameState,
  GameCommand,
  GameSummary,
  GameErrorCode
> = {
  validateDefinition: validateGameDefinition,
  createNewState: createNewGame,
  advanceTime,
  applyCommand,
  getSummary: getGameSummary,
  decodeSave,
  encodeSave,
  isNumericLimit: (error) => error === 'NUMERIC_LIMIT',
  numericLimitError: 'NUMERIC_LIMIT',
  isImmediateCommand: (command) => command.kind !== 'tick' && command.kind !== 'collect',
};

export type LegacyGameRuntime = GameRuntime<
  GameDefinition,
  GameState,
  GameCommand,
  GameSummary,
  GameErrorCode
>;

export function createGameRuntime(
  definition: GameDefinition,
  storage: SaveStorage,
  lease: InstanceLease,
  clock: () => number = Date.now,
): LegacyGameRuntime {
  return createConfiguredGameRuntime(definition, storage, lease, LEGACY_GAME_RUNTIME_DOMAIN, clock);
}
