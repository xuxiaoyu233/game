import type { StoryClueDefinition, StoryDefinition } from '../domain/legacy/expedition/types';

const WORLD_ID = 'world-unlisted-city';
const EMPTY_COST = { wood: 0, stone: 0 };
const DEFAULT_REQUIREMENTS = {
  minClearedWaves: 0,
  requiresBuilding: null,
  requiresBeacon: null,
  requiresProjectId: null,
} as const;

const DIALOGUE_CLUE: StoryClueDefinition = {
  id: 'clue-impossible-return-time',
  source: 'dialogue',
  worldId: null,
  cost: EMPTY_COST,
  ...DEFAULT_REQUIREMENTS,
};

/** Approved v3 story facts for the first playable world. */
export const STORY_V13_DEFINITION: StoryDefinition = {
  storyThreads: [
    {
      id: 'seventh-ring-call',
      worldId: WORLD_ID,
      kind: 'chapter',
      objectiveIds: ['objective-secure-seventh-ring'],
      clueIds: ['clue-unlisted-rescue-receipt'],
    },
    {
      id: 'unlisted-households',
      worldId: WORLD_ID,
      kind: 'side-story',
      objectiveIds: ['objective-check-lamp-record'],
      clueIds: ['clue-household-lamp-record'],
    },
    {
      id: 'extra-ledger-page',
      worldId: WORLD_ID,
      kind: 'side-story',
      objectiveIds: ['objective-secure-household-page'],
      clueIds: ['clue-missing-household-page'],
    },
  ],
  clues: [
    {
      id: 'clue-unlisted-rescue-receipt',
      source: 'return',
      worldId: WORLD_ID,
      minClearedWaves: 2,
      requiresBuilding: 'shelter',
      requiresBeacon: null,
      requiresProjectId: null,
      cost: EMPTY_COST,
    },
    {
      id: 'clue-household-lamp-record',
      source: 'project',
      worldId: WORLD_ID,
      minClearedWaves: 1,
      requiresBuilding: null,
      requiresBeacon: null,
      requiresProjectId: 'project-check-vacant-house',
      cost: EMPTY_COST,
      requiresContractId: 'contract-audit-missing-district',
    },
    {
      id: 'clue-missing-household-page',
      source: 'project',
      worldId: WORLD_ID,
      minClearedWaves: 1,
      requiresBuilding: null,
      requiresBeacon: null,
      requiresProjectId: 'project-seal-household-page',
      cost: EMPTY_COST,
      requiresContractId: 'contract-recover-household-page',
    },
    DIALOGUE_CLUE,
  ],
  dialogues: [
    {
      id: 'dialogue-return-audit',
      requiredClueIds: ['clue-unlisted-rescue-receipt'],
      options: [
        {
          id: 'option-file-as-registration-error',
          grantsClueId: DIALOGUE_CLUE.id,
          nextRunBonus: { wood: 0, stone: 6 },
        },
        {
          id: 'option-reopen-rescue-case',
          grantsClueId: DIALOGUE_CLUE.id,
          nextRunBonus: { wood: 6, stone: 0 },
        },
      ],
    },
  ],
};
