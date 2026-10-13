import type { GameState } from '../types';
import type {
  OutpostCommand,
  OutpostDefinition,
  OutpostErrorCode,
  OutpostState,
} from '../outpost/types';

export type ResourceId = 'wood' | 'stone';
export type BuildingId = 'shelter' | 'lumber-camp' | 'quarry' | 'wall' | 'tower' | 'monument';
export type PerkId = 'harvest-training' | 'reinforced-core' | 'field-repair';
export type ResearchNodeId = 'production-budget' | 'battle-bracing' | 'evidence-ledger';
export type WorldVariantId =
  | 'forest-river-survey'
  | 'forest-boundary-watch'
  | 'ruins-observatory'
  | 'ruins-relief-route'
  | 'snow-fuel-cache'
  | 'snow-radiator-salvage';
export type Resources = Readonly<Record<ResourceId, number>>;
export type WorkerPresetId = 'balanced' | 'logging' | 'mining' | 'guard';
export type WorkerRole = 'wood' | 'stone' | 'guard';
export type StanceId = 'balanced' | 'industry' | 'fortified';
export type DifficultyModifierId =
  | 'supply-shortage'
  | 'compressed-preparation'
  | 'intensified-threat'
  | 'frozen-appropriation'
  | 'early-tide'
  | 'exposed-anchor';

export type DifficultyModifierEffect =
  | { readonly kind: 'starting-resource-multiplier'; readonly multiplier: number }
  | { readonly kind: 'stage-duration-multiplier'; readonly multiplier: number }
  | { readonly kind: 'wave-strength-multiplier'; readonly multiplier: number }
  | { readonly kind: 'snow-fuel-burn-multiplier'; readonly multiplier: number };

export interface DifficultyModifierDefinition {
  readonly id: DifficultyModifierId;
  readonly difficulty: number;
  readonly appliesToModes: readonly WorldModeDefinition['kind'][];
  readonly effects: readonly DifficultyModifierEffect[];
  readonly storyThreadId?: string;
}

export interface ResourceLedger {
  readonly opening: Resources;
  readonly produced: Resources;
  readonly collected: Resources;
  readonly found: Resources;
  readonly spent: Resources;
  readonly sinceUpgrade: boolean;
}

export interface BuildingDefinition {
  readonly id: BuildingId;
  /** Stable narrative/content registry ID; id is the closed engine slot. */
  readonly contentId?: string;
  readonly cost: Resources;
  readonly priceGrowth: number;
  readonly maxCount: number;
  readonly unlockAfterWave: number;
  readonly production: Resources;
  readonly defense: number;
  readonly stabilityBonus?: number;
}

interface WorldDefinitionBase {
  readonly id: string;
  readonly unlockAfterWorld: string | null;
  readonly unlockAfterDialogueId: string | null;
  readonly initialResources: Resources;
  readonly resourceCaps: Resources;
  readonly baseProduction: Resources;
  readonly buildings: readonly BuildingDefinition[];
  /** Maps closed engine resource slots to stable, world-authored resource IDs. */
  readonly resourceDefinitions?: readonly {
    readonly slot: ResourceId;
    readonly id: string;
  }[];
}

export interface WaveSurvivalModeDefinition {
  readonly kind: 'wave-survival';
}

export interface SnowObservatoryModeDefinition {
  readonly kind: 'snow-observatory';
  readonly stageDurationMs: number;
  readonly nodeCount: number;
  readonly initialFuel: number;
  readonly fuelCapacity: number;
  readonly fuelBurnPerSecond: number;
  readonly heatingPerSecond: number;
  readonly coolingPerSecond: number;
  readonly initialTemperature: number;
  readonly dangerTemperature: number;
  readonly temperatureCap: number;
  readonly initialGeneratorIntegrity: number;
  readonly generatorIntegrityCapacity: number;
  readonly requiredGeneratorIntegrity: number;
  readonly repairCost: Resources;
  readonly repairIntegrity: number;
  readonly stokeCost: Resources;
  readonly stokeFuel: number;
}

export interface AnchorCityModeDefinition {
  readonly kind: 'anchor-city';
  readonly initialStability: number;
  readonly stabilityCapacity: number;
  readonly stabilityLossPerWave: number;
  readonly earlyPressureLoss: number;
}

export type WorldModeDefinition =
  WaveSurvivalModeDefinition | AnchorCityModeDefinition | SnowObservatoryModeDefinition;

export type WorldDefinition = WorldDefinitionBase &
  (
    | {
        readonly mode?: WaveSurvivalModeDefinition | AnchorCityModeDefinition;
        readonly waveStrengths: readonly [number, number, number];
        readonly preparationMs: readonly [number, number, number];
      }
    | {
        readonly mode: SnowObservatoryModeDefinition;
        readonly waveStrengths?: never;
        readonly preparationMs?: never;
      }
  );

export interface SnowRunState {
  readonly fuel: number;
  readonly fuelFromWood: number;
  readonly fuelConsumed: number;
  readonly temperature: number;
  readonly generatorIntegrity: number;
  readonly heaterOn: boolean;
  readonly nodesResolved: number;
  readonly pendingReason: 'checkpoint' | 'low-temperature' | 'fuel-depleted' | null;
}

export interface AnchorCityRunState {
  readonly stability: number;
}

export interface PerkDefinition {
  readonly id: PerkId;
  readonly contentId?: string;
  readonly cost: number;
}

export type ResearchEffect =
  | { readonly kind: 'production-building-discount'; readonly amount: Resources }
  | { readonly kind: 'brace-next-wave'; readonly damageReduction: number }
  | { readonly kind: 'investigation-cost-discount'; readonly amount: Resources };

export interface ResearchNodeDefinition {
  readonly id: ResearchNodeId;
  readonly contentId?: string;
  readonly category: 'production' | 'defense' | 'investigation';
  readonly cost: number;
  readonly appliesToWorldIds?: readonly string[];
  readonly requiredClueIds: readonly string[];
  readonly requiredResearchNodeIds: readonly ResearchNodeId[];
  readonly effect: ResearchEffect;
}

export interface ResearchRootDefinition {
  readonly id: string;
  readonly requiredClueIds: readonly string[];
}

export interface WorldVariantDefinition {
  readonly id: WorldVariantId;
  readonly worldId: string;
  readonly contractId: string;
  readonly requiredDialogueChoice?: {
    readonly dialogueId: string;
    readonly optionId: string;
  } | null;
  readonly initialResourceBonus: Resources;
  readonly eventGroupId: string | null;
}

export interface StoryClueDefinition {
  readonly id: string;
  readonly source: 'return' | 'investigate' | 'project' | 'dialogue';
  readonly worldId: string | null;
  readonly minClearedWaves: number;
  readonly requiresBuilding: BuildingId | null;
  readonly requiresBeacon: 'restore' | null;
  readonly requiresProjectId: string | null;
  readonly requiresContractId?: string | null;
  readonly cost: Resources;
}

export type ObjectiveCondition =
  | { readonly kind: 'building-count'; readonly buildingId: BuildingId; readonly count: number }
  | { readonly kind: 'cleared-waves'; readonly count: number }
  | { readonly kind: 'environment-node-count'; readonly count: number }
  | { readonly kind: 'generator-integrity'; readonly minimum: number }
  | { readonly kind: 'completed-project'; readonly projectId: string };

export interface ObjectiveDefinition {
  readonly id: string;
  readonly worldId: string;
  readonly conditions: readonly ObjectiveCondition[];
  readonly rewardPoints: number;
  readonly clueId: string | null;
}

export interface ContractDefinition {
  readonly id: string;
  readonly worldId: string;
  readonly isDefault: boolean;
  readonly primaryObjectiveIds: readonly string[];
  readonly optionalObjectiveIds: readonly string[];
  readonly unlockAfterCompletedObjectiveIds: readonly string[];
  readonly unlockAfterAnyCompletedObjectiveIds?: readonly string[];
  readonly unlockAfterDialogueChoice?: {
    readonly dialogueId: string;
    readonly optionId: string;
  } | null;
}

export interface EventOptionDefinition {
  readonly id: string;
  readonly cost: Resources;
  readonly requiresObjectiveId: string | null;
  readonly unlockProjectIds: readonly string[];
  readonly resourceReward?: Resources;
  readonly anchorStabilityDelta?: number;
}

export interface ExpeditionEventDefinition {
  readonly id: string;
  readonly worldId: string;
  readonly storyThreadId?: string;
  readonly groupId?: string | null;
  readonly afterClearedWaves: number;
  readonly afterEnvironmentNodes?: number;
  readonly randomPool?: 'incident';
  readonly minimumAnchorStability?: number;
  readonly requiresObjectiveId: string | null;
  readonly options: readonly EventOptionDefinition[];
}

export interface ExpeditionProjectDefinition {
  readonly id: string;
  readonly worldId: string;
  readonly afterClearedWaves: number;
  readonly durationMs: number;
  readonly workerCount: number;
  readonly cost: Resources;
  readonly requiredEventChoice: { readonly eventId: string; readonly optionId: string };
  readonly objectiveId: string;
  readonly minimumAnchorStability?: number;
}

export interface ActiveProject {
  readonly projectId: string;
  readonly workerRole: WorkerRole;
  readonly elapsedMs: number;
}

export interface ObjectiveProgress {
  readonly objectiveId: string;
  readonly completed: boolean;
  readonly mandatory: boolean;
  readonly rewardPoints: number;
}

export interface StoryDialogueDefinition {
  readonly id: string;
  readonly requiredClueIds: readonly string[];
  readonly options: readonly {
    readonly id: string;
    readonly grantsClueId: string;
    readonly nextRunBonus: Resources;
  }[];
}

export interface StoryDefinition {
  readonly clues: readonly StoryClueDefinition[];
  readonly dialogues: readonly StoryDialogueDefinition[];
  readonly storyThreads?: readonly StoryThreadDefinition[];
}

export interface StoryThreadDefinition {
  readonly id: string;
  readonly worldId: string;
  readonly kind: 'chapter' | 'side-story';
  readonly objectiveIds: readonly string[];
  readonly clueIds: readonly string[];
}

export interface ExpeditionDefinition {
  readonly contentVersion: string;
  readonly outpost?: OutpostDefinition;
  readonly worlds: readonly WorldDefinition[];
  readonly contracts: readonly ContractDefinition[];
  readonly objectives: readonly ObjectiveDefinition[];
  readonly events: readonly ExpeditionEventDefinition[];
  readonly projects: readonly ExpeditionProjectDefinition[];
  readonly perks: readonly PerkDefinition[];
  readonly researchRoot?: ResearchRootDefinition | null;
  readonly researchNodes?: readonly ResearchNodeDefinition[];
  readonly worldVariants?: readonly WorldVariantDefinition[];
  readonly story: StoryDefinition;
  readonly workforce: {
    readonly size: number;
    readonly woodRate: number;
    readonly stoneRate: number;
    readonly guardDefense: number;
    readonly presets: readonly {
      readonly id: WorkerPresetId;
      readonly contentId?: string;
      readonly wood: number;
      readonly stone: number;
      readonly guard: number;
    }[];
  };
  readonly stances: readonly {
    readonly id: StanceId;
    readonly contentId?: string;
    readonly productionMultiplier: number;
    readonly defenseMultiplier: number;
  }[];
  readonly earlyBattle: { readonly maxPointsPerWave: number; readonly pressureMultiplier: number };
  readonly gatherCooldownMs: number;
  readonly gatherYield: number;
  readonly harvestMultiplier: number;
  readonly hpMultiplier: number;
  readonly repairHp: number;
  readonly finalWaveMultiplier: number;
  readonly baseHp: number;
  readonly baseDefense: number;
  readonly beaconRestoreCost: Resources;
  readonly beaconSalvageReward: Resources;
  readonly beaconDefense: number;
  readonly rewards: {
    readonly base: number;
    readonly monument: number;
    readonly beacon: number;
    readonly finalWave: number;
    readonly boostedFinal: number;
  };
  readonly difficultyModifiers?: readonly DifficultyModifierDefinition[];
  readonly difficultyRewardTiers?: readonly {
    readonly minimumDifficulty: number;
    readonly maximumDifficulty: number | null;
    readonly points: number;
  }[];
  readonly workerTransitionMs?: number;
}

export interface Profile {
  readonly points: number;
  readonly totalPoints: number;
  readonly perkIds: readonly PerkId[];
  readonly researchNodeIds: readonly ResearchNodeId[];
  readonly equippedPreparationId: ResearchNodeId | null;
  readonly selectedVariantIds: Readonly<Record<string, WorldVariantId>>;
  readonly clearedWorldIds: readonly string[];
  readonly nextRunSequence: number;
  readonly settledThrough: number;
  readonly discoveredClueIds: readonly string[];
  readonly dialogueChoices: Readonly<Record<string, string>>;
  readonly completedObjectiveIds: readonly string[];
  readonly selectedDifficultyModifierIds: Readonly<Record<string, readonly DifficultyModifierId[]>>;
}

export interface BattleReport {
  readonly wave: number;
  readonly strength: number;
  readonly defense: number;
  readonly braceReduction: number;
  readonly damage: number;
  readonly hpAfter: number;
  readonly survived: boolean;
  readonly preparationRemainingMs: number;
  readonly initiativePoints: number;
  readonly stanceId: StanceId;
}

export interface RunState {
  readonly sequence: number;
  readonly worldId: string;
  readonly contractId: string;
  readonly variantId: WorldVariantId | null;
  readonly preparationId: ResearchNodeId | null;
  readonly phase: 'preparing' | 'awaiting-wave' | 'awaiting-environment' | 'completed' | 'failed';
  readonly snowState: SnowRunState | null;
  readonly anchorCityState: AnchorCityRunState | null;
  readonly resources: Resources;
  readonly buildings: Readonly<Record<BuildingId, number>>;
  readonly hp: number;
  readonly maxHp: number;
  readonly clearedWaves: number;
  readonly elapsedInStageMs: number;
  readonly gatherAvailableAt: number;
  readonly beaconChoice: 'salvage' | 'restore' | null;
  readonly boostedFinal: boolean;
  readonly repairUsed: boolean;
  readonly braceUsed: boolean;
  readonly braceArmed: boolean;
  readonly investigationDiscountUsed: boolean;
  readonly lastBattle: BattleReport | null;
  readonly recoveredClueIds: readonly string[];
  readonly workerPresetId: WorkerPresetId;
  readonly stanceId: StanceId;
  readonly stanceChosen: boolean;
  readonly initiativePoints: number;
  readonly securedRewards: readonly RewardLine[];
  readonly securedObjectiveIds: readonly string[];
  readonly securedClueIds: readonly string[];
  readonly resourceLedger: ResourceLedger;
  readonly eventChoices: Readonly<Record<string, string>>;
  readonly activeProject: ActiveProject | null;
  readonly completedProjectIds: readonly string[];
  readonly difficultyModifierIds: readonly DifficultyModifierId[];
  readonly randomEventSeed: number;
  readonly randomEventId: string | null;
  readonly randomEventsEnabled: boolean;
  readonly workerTransition: {
    readonly targetPresetId: WorkerPresetId;
    readonly remainingMs: number;
  } | null;
}

export interface RewardLine {
  readonly id:
    | 'base'
    | 'monument'
    | 'beacon'
    | 'final-wave'
    | 'boosted-final'
    | 'initiative'
    | 'difficulty'
    | `objective:${string}`;
  readonly points: number;
}

export interface Settlement {
  readonly sequence: number;
  readonly worldId: string;
  readonly contractId: string;
  readonly outcome: 'success' | 'secured' | 'failed' | 'abandoned';
  readonly clearedWaves: number;
  readonly rewards: readonly RewardLine[];
  readonly points: number;
  readonly completedObjectiveIds: readonly string[];
  readonly difficultyModifierIds: readonly DifficultyModifierId[];
  readonly difficultyScore: number;
}

/** One atomic file contains permanent and temporary progress and the archived v1 prototype. */
export interface SaveBundle {
  readonly schemaVersion: 7 | 8 | 9;
  readonly contentVersion: string;
  readonly profile: Profile;
  readonly activeRun: RunState | null;
  readonly lastSettlement: Settlement | null;
  readonly legacyArchive: GameState | null;
  readonly outpost: OutpostState | null;
  readonly lastSimulatedAt: number;
}

export type ExpeditionCommand =
  | OutpostCommand
  | { readonly kind: 'tick' }
  | {
      readonly kind: 'enter-world';
      readonly worldId: string;
      readonly contractId?: string;
      readonly seed?: number;
    }
  | {
      readonly kind: 'select-difficulty-modifiers';
      readonly worldId: string;
      readonly modifierIds: readonly DifficultyModifierId[];
    }
  | { readonly kind: 'research-node'; readonly researchNodeId: ResearchNodeId }
  | { readonly kind: 'equip-preparation'; readonly researchNodeId: ResearchNodeId | null }
  | {
      readonly kind: 'select-world-variant';
      readonly worldVariantId: WorldVariantId | null;
      readonly worldId?: string;
    }
  | { readonly kind: 'gather'; readonly resource: ResourceId }
  | { readonly kind: 'build'; readonly buildingId: BuildingId }
  | { readonly kind: 'fight-wave' }
  | { readonly kind: 'fight-early' }
  | { readonly kind: 'set-workers'; readonly presetId: WorkerPresetId }
  | { readonly kind: 'choose-stance'; readonly stanceId: StanceId }
  | { readonly kind: 'choose-beacon'; readonly optionId: 'salvage' | 'restore' }
  | { readonly kind: 'set-final-boost'; readonly enabled: boolean }
  | { readonly kind: 'repair' }
  | { readonly kind: 'reinforce-anchor' }
  | { readonly kind: 'brace' }
  | { readonly kind: 'stoke-furnace' }
  | { readonly kind: 'repair-generator' }
  | { readonly kind: 'continue-snow'; readonly heaterOn: boolean }
  | { readonly kind: 'return' }
  | { readonly kind: 'secure-rewards' }
  | { readonly kind: 'abandon' }
  | { readonly kind: 'buy-perk'; readonly perkId: PerkId }
  | { readonly kind: 'investigate'; readonly clueId: string }
  | { readonly kind: 'choose-dialogue'; readonly dialogueId: string; readonly optionId: string }
  | { readonly kind: 'choose-event'; readonly eventId: string; readonly optionId: string }
  | { readonly kind: 'start-project'; readonly projectId: string; readonly workerRole: WorkerRole };

export type ExpeditionErrorCode =
  | 'UNKNOWN_ID'
  | 'LOCKED'
  | 'WRONG_PHASE'
  | 'INSUFFICIENT_RESOURCES'
  | 'MAX_COUNT'
  | 'COOLDOWN'
  | 'ALREADY_CHOSEN'
  | 'ALREADY_PURCHASED'
  | 'INVALID_SELECTION'
  | 'TASK_NOT_READY'
  | 'PROJECT_ACTIVE'
  | 'ALREADY_COMPLETED'
  | 'WORKER_UNAVAILABLE'
  | 'EVENT_REQUIRED'
  | 'ANCHOR_STABLE'
  | 'NUMERIC_LIMIT'
  | OutpostErrorCode;

export type ExpeditionActionResult =
  | { readonly ok: true; readonly state: SaveBundle }
  | { readonly ok: false; readonly state: SaveBundle; readonly error: ExpeditionErrorCode };

export interface ExpeditionSummary {
  readonly availableWorldIds: readonly string[];
  readonly production: Resources;
  readonly defense: number;
  readonly nextWaveStrength: number;
  readonly predictedDamage: number;
  readonly stageRemainingMs: number;
  readonly buildingCosts: Readonly<Record<BuildingId, Resources>>;
  readonly availableBuildingIds: readonly BuildingId[];
  readonly canReturn: boolean;
  readonly canSecureRewards: boolean;
  readonly rewardPreview: readonly RewardLine[];
  readonly rewardTotal: number;
  readonly securedRewardTotal: number;
  readonly atRiskRewardTotal: number;
  readonly nextWaveRewardTotal: number;
  readonly beaconPending: boolean;
  readonly canRepair: boolean;
  readonly canBrace: boolean;
  readonly braceDamageReduction: number;
  readonly availableClueIds: readonly string[];
  readonly availableResearchNodeIds: readonly ResearchNodeId[];
  readonly availableWorldVariantIds: readonly WorldVariantId[];
  readonly investigationCosts: Readonly<Record<string, Resources>>;
  readonly snowEnvironment: {
    readonly fuel: number;
    readonly fuelCapacity: number;
    readonly temperature: number;
    readonly dangerTemperature: number;
    readonly generatorIntegrity: number;
    readonly requiredGeneratorIntegrity: number;
    readonly heaterOn: boolean;
    readonly nodesResolved: number;
    readonly nodeCount: number;
    readonly pendingReason: SnowRunState['pendingReason'];
    readonly projectedTemperature: number;
    readonly projectedFuel: number;
    readonly projectedStageMs: number;
    readonly canStoke: boolean;
    readonly canRepairGenerator: boolean;
    readonly canContinue: boolean;
  } | null;
  readonly anchorStability: {
    readonly current: number;
    readonly capacity: number;
    readonly nextWaveLoss: number;
    readonly earlyPressureLoss: number;
    readonly optionalRouteThreshold: number;
  } | null;
  readonly pendingDialogueIds: readonly string[];
  readonly availableContractIds: readonly string[];
  readonly canFightEarly: boolean;
  readonly canFightWave: boolean;
  readonly earlyBonus: number;
  readonly earlyWaveStrength: number;
  readonly earlyPredictedDamage: number;
  readonly earlyYieldForgone: Resources;
  readonly canChooseStance: boolean;
  readonly productionSources: readonly {
    readonly id: 'natural' | 'workers' | 'buildings';
    readonly production: Resources;
  }[];
  readonly activeContractId: string | null;
  readonly objectives: readonly ObjectiveProgress[];
  readonly pendingEvents: readonly ExpeditionEventDefinition[];
  readonly availableProjectIds: readonly string[];
  readonly activeProject: ActiveProject | null;
  readonly completedProjectIds: readonly string[];
  readonly difficultyModifierIds: readonly DifficultyModifierId[];
  readonly difficultyScore: number;
  readonly difficultyReward: number;
  readonly workerTransitionRemainingMs: number;
  readonly workerTransitionTargetPresetId: WorkerPresetId | null;
}
