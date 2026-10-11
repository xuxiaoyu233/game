import { createResourceLedger } from './engine';
import type { ExpeditionDefinition, SaveBundle } from './types';
import type {
  ExpeditionDefinition as Version2Definition,
  SaveBundle as Version2Save,
} from './v2-types';

/** Settle the old interval with the frozen v2 rules before enabling v3 workers or strategies. */
export function migrateVersion2Save(
  state: Version2Save,
  previous: Version2Definition,
  current: ExpeditionDefinition,
  now: number,
): SaveBundle {
  if (!Number.isFinite(now) || now < 0 || now > Number.MAX_SAFE_INTEGER)
    throw new RangeError('Invalid migration time');
  const lastSimulatedAt = Math.max(state.lastSimulatedAt, now);
  const defaultContractId = (worldId: string): string => {
    const contract = current.contracts.find(
      (candidate) => candidate.worldId === worldId && candidate.isDefault,
    );
    if (!contract) throw new Error(`Missing default contract for migrated world: ${worldId}`);
    return contract.id;
  };
  const settledObjectives =
    state.lastSettlement?.outcome === 'success'
      ? (current.contracts.find(
          (candidate) => candidate.worldId === state.lastSettlement?.worldId && candidate.isDefault,
        )?.primaryObjectiveIds ?? [])
      : [];
  let run = state.activeRun;
  if (run?.phase === 'preparing') {
    const world = previous.worlds.find((item) => item.id === run?.worldId);
    if (!world) throw new Error('Unknown v2 world');
    const duration = world.preparationMs?.[run.clearedWaves];
    if (duration === undefined) throw new Error('Invalid v2 stage');
    const elapsed = Math.min(
      lastSimulatedAt - state.lastSimulatedAt,
      duration - run.elapsedInStageMs,
    );
    const production = { ...world.baseProduction };
    for (const building of world.buildings) {
      production.wood += run.buildings[building.id] * building.production.wood;
      production.stone += run.buildings[building.id] * building.production.stone;
    }
    const multiplier = state.profile.perkIds.includes('harvest-training')
      ? previous.harvestMultiplier
      : 1;
    const elapsedInStageMs = run.elapsedInStageMs + elapsed;
    run = {
      ...run,
      elapsedInStageMs,
      phase: elapsedInStageMs >= duration ? 'awaiting-wave' : 'preparing',
      resources: {
        wood: Math.min(
          world.resourceCaps.wood,
          run.resources.wood + (production.wood * multiplier * elapsed) / 1000,
        ),
        stone: Math.min(
          world.resourceCaps.stone,
          run.resources.stone + (production.stone * multiplier * elapsed) / 1000,
        ),
      },
    };
  }
  return {
    ...state,
    schemaVersion: 7,
    contentVersion: current.contentVersion,
    lastSimulatedAt,
    profile: {
      ...state.profile,
      completedObjectiveIds: settledObjectives,
      researchNodeIds: [],
      equippedPreparationId: null,
      selectedVariantIds: {},
      selectedDifficultyModifierIds: {},
    },
    activeRun:
      run === null
        ? null
        : {
            ...run,
            contractId: defaultContractId(run.worldId),
            eventChoices: {},
            activeProject: null,
            completedProjectIds: [],
            workerPresetId: 'balanced',
            stanceId: 'balanced',
            stanceChosen: run.clearedWaves > 0 || run.phase === 'failed',
            initiativePoints: 0,
            securedRewards: [],
            securedObjectiveIds: [],
            securedClueIds: [],
            variantId: null,
            preparationId: null,
            snowState: null,
            braceUsed: false,
            braceArmed: false,
            investigationDiscountUsed: false,
            difficultyModifierIds: [],
            randomEventSeed: run.sequence,
            randomEventId: null,
            randomEventsEnabled: false,
            workerTransition: null,
            anchorCityState: null,
            resourceLedger: createResourceLedger(run.resources, true),
            lastBattle:
              run.lastBattle === null
                ? null
                : {
                    ...run.lastBattle,
                    preparationRemainingMs: 0,
                    initiativePoints: 0,
                    stanceId: 'balanced',
                    braceReduction: 0,
                  },
          },
    lastSettlement:
      state.lastSettlement === null
        ? null
        : {
            ...state.lastSettlement,
            contractId: defaultContractId(state.lastSettlement.worldId),
            completedObjectiveIds: settledObjectives,
            difficultyModifierIds: [],
            difficultyScore: 0,
          },
  };
}
