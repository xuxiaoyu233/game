import { describe, expect, it } from 'vitest';
import { createNewGame } from '../domain/engine';
import type { GameDefinition } from '../domain/types';
import { decodeSave, encodeSave, validateSaveState } from './save-codec';

const definition: GameDefinition = {
  contentVersion: 'codec-1',
  worldId: 'codec-world',
  initialClickYield: 1,
  maxOfflineMs: 1_000,
  tools: [
    { id: 'cart', baseCost: 20, costGrowth: 1.18, productionRate: 0.5 },
    {
      id: 'bench',
      baseCost: 120,
      costGrowth: 1.18,
      productionRate: 3,
      unlockedByTaskId: 'first-task',
    },
  ],
  upgrades: [
    {
      id: 'clip',
      cost: 60,
      effect: { kind: 'click-multiplier', multiplier: 2 },
      unlockedByTaskId: 'first-task',
    },
  ],
  tasks: [
    { id: 'first-task', totalGathered: 50, requiredTool: { toolId: 'cart', count: 1 }, reward: 30 },
    {
      id: 'second-task',
      previousTaskId: 'first-task',
      totalGathered: 500,
      requiredTool: { toolId: 'bench', count: 1 },
      reward: 120,
    },
  ],
  events: [
    {
      id: 'crate',
      triggeredByTaskId: 'second-task',
      options: [{ id: 'grant', effect: { kind: 'resource-grant', amount: 200 } }],
    },
  ],
};

describe('save validation', () => {
  it('round trips canonical state and drops untrusted runtime metadata', () => {
    const state = createNewGame(definition, 100);
    expect(decodeSave(encodeSave(state), definition)).toEqual(state);
    expect(
      validateSaveState({ ...state, revision: 9_999, productionRate: 999 }, definition),
    ).toEqual(state);
  });

  it.each([
    { balance: Infinity },
    { balance: NaN },
    { balance: -1 },
    { totalGathered: Number.MAX_SAFE_INTEGER + 1 },
    { lastSimulatedAt: 'yesterday' },
    { toolCounts: { cart: 0.5, bench: 0 } },
    { toolCounts: { cart: 0 } },
    { toolCounts: { cart: 0, bench: 0, foreign: 1 } },
    { purchasedUpgradeIds: ['foreign'] },
    { purchasedUpgradeIds: ['clip', 'clip'] },
    { claimedTaskIds: ['first-task', 'first-task'] },
    { claimedTaskIds: ['second-task'] },
    { eventChoices: { crate: 'missing' } },
    { eventChoices: { crate: 'grant' } },
    { eventChoices: { foreign: 'grant' } },
    { purchasedUpgradeIds: ['clip'] },
    { toolCounts: { cart: 0, bench: 1 } },
    { balance: 1 },
  ])('rejects broken state relationships: %j', (patch) => {
    expect(() =>
      validateSaveState({ ...createNewGame(definition, 0), ...patch }, definition),
    ).toThrow();
  });

  it('allows task and event grants above total gathered when their prerequisites hold', () => {
    expect(
      validateSaveState(
        {
          ...createNewGame(definition, 0),
          balance: 750,
          totalGathered: 500,
          toolCounts: { cart: 1, bench: 1 },
          claimedTaskIds: ['first-task', 'second-task'],
          eventChoices: { crate: 'grant' },
        },
        definition,
      ).balance,
    ).toBe(750);
  });
});
