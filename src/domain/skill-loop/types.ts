export type SkillLoopId = string;

export interface SkillLevelThreshold {
  readonly level: number;
  readonly xpRequired: number;
}

export interface SkillDefinition {
  readonly id: SkillLoopId;
  readonly levels: readonly SkillLevelThreshold[];
}

export interface ItemDefinition {
  readonly id: SkillLoopId;
  readonly categoryId: SkillLoopId;
}

export interface ItemCategoryDefinition {
  readonly id: SkillLoopId;
}

export interface MaterialAmount {
  readonly itemId: SkillLoopId;
  readonly amount: number;
}

export interface RecipeDefinition {
  readonly id: SkillLoopId;
  readonly inputs: readonly MaterialAmount[];
  readonly outputs: readonly MaterialAmount[];
}

interface ActivityBase {
  readonly id: SkillLoopId;
  readonly skillId: SkillLoopId;
  readonly requiredLevel: number;
  readonly durationMs: number;
  readonly xpPerCycle: number;
}

export type ActivityDefinition =
  | (ActivityBase & {
      readonly kind: 'gather';
      readonly outputs: readonly MaterialAmount[];
    })
  | (ActivityBase & {
      readonly kind: 'craft';
      readonly recipeId: SkillLoopId;
    });

export interface ToolDefinition {
  readonly id: SkillLoopId;
  readonly skillId: SkillLoopId;
  readonly levels: readonly {
    readonly level: number;
    readonly durationMultiplierPermille: number;
  }[];
}

export interface ToolUpgradeDefinition {
  readonly id: SkillLoopId;
  readonly toolId: SkillLoopId;
  readonly sourceLevel: number;
  readonly targetLevel: number;
  readonly requiredItemId: SkillLoopId;
  readonly requiredAmount: number;
}

export interface SkillLoopDefinition {
  readonly profileId: 'skill-prototype-v1';
  readonly schemaVersion: 1 | 2;
  readonly contentVersion: string;
  readonly maxOfflineMs: number;
  readonly skills: readonly SkillDefinition[];
  readonly itemCategories: readonly ItemCategoryDefinition[];
  readonly items: readonly ItemDefinition[];
  readonly activities: readonly ActivityDefinition[];
  readonly recipes: readonly RecipeDefinition[];
  readonly tools: readonly ToolDefinition[];
  readonly toolUpgrades: readonly ToolUpgradeDefinition[];
  readonly initialInventory: Readonly<Record<SkillLoopId, number>>;
  readonly initialSkillXp: Readonly<Record<SkillLoopId, number>>;
  readonly initialToolLevels: Readonly<Record<SkillLoopId, number>>;
}

export type ActivityStopReason = 'insufficient-materials';

export interface CurrentActivity {
  readonly activityId: SkillLoopId;
  readonly status: 'running' | 'paused' | 'stopped';
  readonly progressMs: number;
  /** Captures the current cycle's period; later upgrades affect the next cycle only. */
  readonly cycleDurationMs: number;
  readonly stopReason: ActivityStopReason | null;
}

export interface SkillLoopState {
  readonly schemaVersion: 1 | 2;
  readonly profileId: 'skill-prototype-v1';
  readonly contentVersion: string;
  readonly inventory: Readonly<Record<SkillLoopId, number>>;
  readonly skillXp: Readonly<Record<SkillLoopId, number>>;
  readonly toolLevels: Readonly<Record<SkillLoopId, number>>;
  readonly currentActivity: CurrentActivity | null;
  readonly lastSimulatedAt: number;
  readonly returnReport: SkillLoopReturnReport | null;
}

export interface SkillLoopReturnReport {
  readonly elapsedMs: number;
  readonly settlementWindowMs: number;
  readonly offlineCapReached: boolean;
  readonly activityId: SkillLoopId | null;
  readonly reason: 'continuing' | 'insufficient-materials' | 'paused' | 'no-activity';
  readonly inventoryDelta: Readonly<Record<SkillLoopId, number>>;
  readonly skillXpDelta: Readonly<Record<SkillLoopId, number>>;
  readonly unlockedActivityIds: readonly SkillLoopId[];
}

export type SkillLoopCommand =
  | { readonly kind: 'tick' }
  | { readonly kind: 'start-activity'; readonly activityId: SkillLoopId }
  | { readonly kind: 'switch-activity'; readonly activityId: SkillLoopId }
  | { readonly kind: 'pause-activity' }
  | { readonly kind: 'resume-activity' }
  | { readonly kind: 'buy-tool-upgrade'; readonly upgradeId: SkillLoopId }
  | { readonly kind: 'acknowledge-return-report' };

export type SkillLoopErrorCode =
  | 'UNKNOWN_ACTIVITY'
  | 'UNKNOWN_UPGRADE'
  | 'LOCKED'
  | 'ACTIVITY_ALREADY_RUNNING'
  | 'NO_ACTIVITY_TO_PAUSE'
  | 'NO_ACTIVITY_TO_RESUME'
  | 'INSUFFICIENT_RESOURCES'
  | 'ALREADY_PURCHASED'
  | 'NUMERIC_LIMIT';

export interface SkillProgressSummary {
  readonly level: number;
  readonly xp: number;
  readonly xpForNextLevel: number | null;
  readonly xpCeiling: number;
  readonly maximumLevel: number;
  readonly atPrototypeCap: boolean;
}

export interface SkillLoopSummary {
  readonly skills: Readonly<Record<SkillLoopId, SkillProgressSummary>>;
  readonly availableActivityIds: readonly SkillLoopId[];
  readonly nextUnlocks: readonly {
    readonly skillId: SkillLoopId;
    readonly activityId: SkillLoopId;
    readonly level: number;
  }[];
  readonly availableToolUpgradeIds: readonly SkillLoopId[];
  readonly prototypeComplete: boolean;
}

export interface SkillLoopAdvanceResult {
  readonly state: SkillLoopState;
  readonly completedCycles: number;
  readonly elapsedMs: number;
  readonly creditedMs: number;
  readonly error?: 'NUMERIC_LIMIT';
}

export type SkillLoopActionResult =
  | { readonly ok: true; readonly state: SkillLoopState }
  | { readonly ok: false; readonly state: SkillLoopState; readonly error: SkillLoopErrorCode };
