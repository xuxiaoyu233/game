import type { StoryClueDefinition, StoryDefinition } from '../domain/expedition/types';

const EMPTY_COST = { wood: 0, stone: 0 };
const DEFAULT_REQUIREMENTS = {
  minClearedWaves: 0,
  requiresBuilding: null,
  requiresBeacon: null,
  requiresProjectId: null,
} as const;

const DIALOGUE_CLUES: readonly StoryClueDefinition[] = [
  'route-source',
  'route-rescue',
  'door-coordinate',
  'time-loop-proof',
  'river-coordinate',
  'relief-route',
  'snow-order',
].map((id) => ({
  id,
  source: 'dialogue',
  worldId: null,
  cost: EMPTY_COST,
  ...DEFAULT_REQUIREMENTS,
}));

/** Story facts are earned through commands and successful return, independently of presentation. */
export const STORY_V10_DEFINITION: StoryDefinition = {
  clues: [
    {
      id: 'snow-observatory-record',
      source: 'return',
      worldId: 'snow-observatory',
      minClearedWaves: 0,
      requiresBuilding: null,
      requiresBeacon: null,
      requiresProjectId: null,
      cost: EMPTY_COST,
    },
    {
      id: 'forest-signal',
      source: 'return',
      worldId: 'forest',
      minClearedWaves: 2,
      requiresBuilding: 'shelter',
      requiresBeacon: null,
      requiresProjectId: null,
      cost: EMPTY_COST,
    },
    {
      id: 'ruins-record',
      source: 'return',
      worldId: 'ruins',
      minClearedWaves: 2,
      requiresBuilding: 'shelter',
      requiresBeacon: null,
      requiresProjectId: null,
      cost: EMPTY_COST,
    },
    {
      id: 'forest-inscription',
      source: 'investigate',
      worldId: 'forest',
      minClearedWaves: 1,
      requiresBuilding: null,
      requiresBeacon: 'restore',
      requiresProjectId: null,
      cost: { wood: 6, stone: 8 },
    },
    {
      id: 'ruins-script',
      source: 'investigate',
      worldId: 'ruins',
      minClearedWaves: 1,
      requiresBuilding: null,
      requiresBeacon: null,
      requiresProjectId: null,
      cost: { wood: 8, stone: 25 },
    },
    {
      id: 'forest-river-record',
      source: 'project',
      worldId: 'forest',
      minClearedWaves: 1,
      requiresBuilding: null,
      requiresBeacon: null,
      requiresProjectId: 'river-survey',
      cost: EMPTY_COST,
    },
    {
      id: 'forest-perimeter-record',
      source: 'return',
      worldId: 'forest',
      minClearedWaves: 2,
      requiresBuilding: 'wall',
      requiresBeacon: null,
      requiresProjectId: null,
      requiresContractId: 'forest-perimeter-contract',
      cost: EMPTY_COST,
    },
    {
      id: 'forest-relay-record',
      source: 'project',
      worldId: 'forest',
      minClearedWaves: 1,
      requiresBuilding: null,
      requiresBeacon: null,
      requiresProjectId: 'relay-inspection',
      cost: EMPTY_COST,
    },
    {
      id: 'ruins-observatory-record',
      source: 'return',
      worldId: 'ruins',
      minClearedWaves: 3,
      requiresBuilding: 'tower',
      requiresBeacon: null,
      requiresProjectId: null,
      requiresContractId: 'ruins-observatory-contract',
      cost: EMPTY_COST,
    },
    {
      id: 'ruins-relief-manifest',
      source: 'return',
      worldId: 'ruins',
      minClearedWaves: 2,
      requiresBuilding: 'wall',
      requiresBeacon: null,
      requiresProjectId: null,
      requiresContractId: 'ruins-relief-contract',
      cost: EMPTY_COST,
    },
    ...DIALOGUE_CLUES,
  ],
  dialogues: [
    {
      id: 'keeper-debrief',
      requiredClueIds: ['forest-signal'],
      options: [
        { id: 'trace-source', grantsClueId: 'route-source', nextRunBonus: { wood: 0, stone: 6 } },
        { id: 'help-stranded', grantsClueId: 'route-rescue', nextRunBonus: { wood: 8, stone: 0 } },
      ],
    },
    {
      id: 'keeper-revelation',
      requiredClueIds: ['forest-signal', 'ruins-record'],
      options: [
        {
          id: 'follow-coordinate',
          grantsClueId: 'door-coordinate',
          nextRunBonus: { wood: 0, stone: 4 },
        },
        {
          id: 'retain-archive',
          grantsClueId: 'door-coordinate',
          nextRunBonus: { wood: 4, stone: 0 },
        },
      ],
    },
    {
      id: 'keeper-sideproof',
      requiredClueIds: ['forest-inscription', 'ruins-script'],
      options: [{ id: 'cross-check', grantsClueId: 'time-loop-proof', nextRunBonus: EMPTY_COST }],
    },
    {
      id: 'keeper-river-review',
      requiredClueIds: ['forest-river-record'],
      options: [
        {
          id: 'follow-river-coordinate',
          grantsClueId: 'river-coordinate',
          nextRunBonus: { wood: 0, stone: 4 },
        },
        {
          id: 'protect-evacuation-route',
          grantsClueId: 'relief-route',
          nextRunBonus: { wood: 4, stone: 0 },
        },
      ],
    },
    {
      id: 'keeper-snow-debrief',
      requiredClueIds: ['snow-observatory-record'],
      options: [
        {
          id: 'preserve-sequence',
          grantsClueId: 'snow-order',
          nextRunBonus: { wood: 0, stone: 0 },
        },
      ],
    },
  ],
};
