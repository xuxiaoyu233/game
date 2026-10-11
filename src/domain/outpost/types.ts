export type OutpostResourceId =
  | 'reclaimed-alloy'
  | 'charge-cell'
  | 'biofiber'
  | 'structural-panel'
  | 'barrier-kit'
  | 'medical-kit'
  | 'anchor-shard'
  | 'echo-record'
  | 'anchor-frame';

export type OutpostProfessionId = 'salvage' | 'engineering' | 'medical';

export type OutpostJobId = 'recover-alloy' | 'recover-cells' | 'cultivate-biofiber';

export type OutpostRecipeId =
  | 'refine-structural-panel'
  | 'assemble-barrier-kit'
  | 'prepare-medical-kit'
  | 'assemble-anchor-frame';

export type OutpostFacilityId = 'production-hangar';

export interface OutpostResources {
  readonly 'reclaimed-alloy': number;
  readonly 'charge-cell': number;
  readonly biofiber: number;
  readonly 'structural-panel': number;
  readonly 'barrier-kit': number;
  readonly 'medical-kit': number;
  readonly 'anchor-shard': number;
  readonly 'echo-record': number;
  readonly 'anchor-frame': number;
}

export type OutpostAmounts = Readonly<Partial<OutpostResources>>;

export interface OutpostJobDefinition {
  readonly id: OutpostJobId;
  readonly professionId: OutpostProfessionId;
  readonly output: OutpostResourceId;
  readonly amountPerWorkerHour: number;
  readonly experiencePerWorkerHour: number;
}

export interface OutpostRecipeDefinition {
  readonly id: OutpostRecipeId;
  readonly professionId: OutpostProfessionId;
  readonly inputs: OutpostAmounts;
  readonly output: OutpostResourceId;
  readonly outputAmount: number;
  readonly durationMs: number;
  readonly minimumProfessionLevel: number;
  readonly requiredClueIds: readonly string[];
}

export interface OutpostFacilityDefinition {
  readonly id: OutpostFacilityId;
  readonly cost: OutpostAmounts;
  readonly maxCount: number;
  readonly storageCapacityBonus: number;
  readonly resourceCapacityBonus: number;
}

export interface OutpostDefinition {
  readonly population: number;
  readonly storageCapacity: number;
  readonly startingResources: OutpostResources;
  readonly resourceCaps: OutpostResources;
  readonly jobs: readonly OutpostJobDefinition[];
  readonly recipes: readonly OutpostRecipeDefinition[];
  readonly facilities: readonly OutpostFacilityDefinition[];
  readonly professionLevelExperience: readonly number[];
  readonly experiencePerBatch: number;
}

export interface OutpostState {
  readonly resources: OutpostResources;
  readonly jobAssignments: Readonly<Record<OutpostJobId, number>>;
  readonly jobTargets: Readonly<Record<OutpostJobId, number | null>>;
  readonly facilities: Readonly<Record<OutpostFacilityId, number>>;
  readonly reviewedProductionByJob: Readonly<Record<OutpostJobId, number>>;
  readonly reviewedCraftedByRecipe: Readonly<Record<OutpostRecipeId, number>>;
  readonly activeRecipeId: OutpostRecipeId | null;
  readonly remainingBatches: number | null;
  readonly recipeProgressMs: number;
  readonly reservedInputs: OutpostResources;
  readonly reservedOutput: OutpostResourceId | null;
  readonly professionExperience: Readonly<Record<OutpostProfessionId, number>>;
  readonly producedByJob: Readonly<Record<OutpostJobId, number>>;
  readonly craftedByRecipe: Readonly<Record<OutpostRecipeId, number>>;
  readonly pausedReason: 'ingredients' | 'storage' | 'target-reached' | 'workers' | null;
}

export type OutpostCommand =
  | {
      readonly kind: 'set-outpost-workers';
      readonly assignments: Readonly<Record<OutpostJobId, number>>;
    }
  | {
      readonly kind: 'set-outpost-job-target';
      readonly jobId: OutpostJobId;
      readonly target: number | null;
    }
  | { readonly kind: 'acknowledge-outpost-report' }
  | { readonly kind: 'build-outpost-facility'; readonly facilityId: OutpostFacilityId }
  | {
      readonly kind: 'start-outpost-recipe';
      readonly recipeId: OutpostRecipeId;
      readonly batches: number | null;
    }
  | { readonly kind: 'stop-outpost-recipe' };

export type OutpostErrorCode =
  | 'OUTPOST_WORKERS'
  | 'OUTPOST_RECIPE_LOCKED'
  | 'OUTPOST_RECIPE_UNKNOWN'
  | 'OUTPOST_RECIPE_TARGET'
  | 'OUTPOST_RESOURCES'
  | 'OUTPOST_STORAGE'
  | 'OUTPOST_FACILITY_UNKNOWN'
  | 'OUTPOST_FACILITY_MAX';
