import type {
  BattleReport as CurrentBattle,
  ExpeditionDefinition as CurrentDefinition,
  Profile as CurrentProfile,
  RewardLine as CurrentReward,
  RunState as CurrentRun,
  SaveBundle as CurrentSave,
  Settlement as CurrentSettlement,
} from './types';

export type { BuildingDefinition, BuildingId, Resources, WorldDefinition } from './types';
export type Profile = Omit<
  CurrentProfile,
  | 'completedObjectiveIds'
  | 'researchNodeIds'
  | 'equippedPreparationId'
  | 'selectedVariantIds'
  | 'selectedDifficultyModifierIds'
>;
export type ExpeditionDefinition = Omit<
  CurrentDefinition,
  'workforce' | 'stances' | 'earlyBattle' | 'contracts' | 'objectives' | 'events' | 'projects'
>;
export type BattleReport = Omit<
  CurrentBattle,
  'preparationRemainingMs' | 'initiativePoints' | 'stanceId' | 'braceReduction'
>;
export type RunState = Omit<
  CurrentRun,
  | 'workerPresetId'
  | 'stanceId'
  | 'stanceChosen'
  | 'initiativePoints'
  | 'resourceLedger'
  | 'lastBattle'
  | 'contractId'
  | 'eventChoices'
  | 'activeProject'
  | 'completedProjectIds'
  | 'securedRewards'
  | 'securedObjectiveIds'
  | 'securedClueIds'
  | 'variantId'
  | 'preparationId'
  | 'braceUsed'
  | 'braceArmed'
  | 'investigationDiscountUsed'
  | 'snowState'
  | 'anchorCityState'
  | 'difficultyModifierIds'
  | 'randomEventSeed'
  | 'randomEventId'
  | 'randomEventsEnabled'
  | 'workerTransition'
> & { readonly lastBattle: BattleReport | null };
export type RewardLine = Omit<CurrentReward, 'id'> & {
  readonly id: Exclude<CurrentReward['id'], 'initiative' | `objective:${string}`>;
};
export type Settlement = Omit<
  CurrentSettlement,
  'rewards' | 'contractId' | 'completedObjectiveIds' | 'difficultyModifierIds' | 'difficultyScore'
> & {
  readonly rewards: readonly RewardLine[];
};
export type SaveBundle = Omit<
  CurrentSave,
  'schemaVersion' | 'activeRun' | 'lastSettlement' | 'profile'
> & {
  readonly schemaVersion: 2;
  readonly profile: Profile;
  readonly activeRun: RunState | null;
  readonly lastSettlement: Settlement | null;
};
