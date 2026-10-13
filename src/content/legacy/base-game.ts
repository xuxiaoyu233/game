import type { GameDefinition } from '../../domain/legacy/types';

/** Mechanics are independent of the selected theme and its translated labels. */
export const BASE_GAME_DEFINITION: GameDefinition = {
  contentVersion: '1.0.0',
  worldId: 'frontier',
  initialClickYield: 1,
  maxOfflineMs: 8 * 60 * 60 * 1_000,
  tools: [
    { id: 'extractor', baseCost: 20, costGrowth: 1.18, productionRate: 0.5 },
    {
      id: 'processor',
      baseCost: 120,
      costGrowth: 1.18,
      productionRate: 3,
      unlockedByTaskId: 'foothold',
    },
    {
      id: 'drone',
      baseCost: 750,
      costGrowth: 1.18,
      productionRate: 15,
      unlockedByTaskId: 'automation',
    },
  ],
  upgrades: [
    {
      id: 'hand-grip',
      cost: 60,
      effect: { kind: 'click-multiplier', multiplier: 2 },
      unlockedByTaskId: 'foothold',
    },
    {
      id: 'extractor-gears',
      cost: 120,
      effect: { kind: 'tool-multiplier', toolId: 'extractor', multiplier: 2 },
      requiredTool: { toolId: 'extractor', count: 3 },
    },
    {
      id: 'assembly-line',
      cost: 600,
      effect: { kind: 'tool-multiplier', toolId: 'processor', multiplier: 1.5 },
      requiredTool: { toolId: 'processor', count: 2 },
    },
    {
      id: 'drone-calibration',
      cost: 1_800,
      effect: { kind: 'tool-multiplier', toolId: 'drone', multiplier: 1.5 },
      requiredTool: { toolId: 'drone', count: 2 },
    },
  ],
  tasks: [
    {
      id: 'foothold',
      totalGathered: 50,
      requiredTool: { toolId: 'extractor', count: 1 },
      reward: 30,
    },
    {
      id: 'automation',
      previousTaskId: 'foothold',
      totalGathered: 500,
      requiredTool: { toolId: 'processor', count: 1 },
      reward: 120,
    },
    {
      id: 'settlement',
      previousTaskId: 'automation',
      totalGathered: 2_500,
      requiredTool: { toolId: 'drone', count: 1 },
      reward: 500,
    },
  ],
  events: [
    {
      id: 'supply-cache',
      triggeredByTaskId: 'automation',
      options: [
        { id: 'salvage', effect: { kind: 'resource-grant', amount: 200 } },
        { id: 'repair', effect: { kind: 'production-multiplier', multiplier: 1.1 } },
      ],
    },
  ],
};
