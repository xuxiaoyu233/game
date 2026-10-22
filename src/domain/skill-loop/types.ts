export type SkillLoopId = string;

/**
 * Global effects granted by reaching a skill level. Every field takes the current level's value
 * and never accumulates across levels, so content restates a value on later levels to keep it in
 * force. At least one field must be present when an effect exists.
 */
export interface SkillLevelEffect {
  /**
   * Cycle multiplier, not a speed bonus: 870 = every activity cycle runs at 0.87 of its base
   * length (about 15% faster) while this level is in force. 1000 is neutral; below 1000 shortens.
   */
  readonly globalSpeedBonusPermille?: number;
  /** 1150 = skill XP from completed cycles is 15% higher while this level is in force. */
  readonly globalXpBonusPermille?: number;
  /**
   * Extra offline settlement window granted by this level, in ms. The resulting window is capped
   * at 24h no matter how many skills contribute.
   */
  readonly offlineCapBonusMs?: number;
}

export interface SkillLevelThreshold {
  readonly level: number;
  readonly xpRequired: number;
  /** Optional global effect granted by reaching this level (e.g. agility speed). */
  readonly effect?: SkillLevelEffect;
}

export interface SkillDefinition {
  readonly id: SkillLoopId;
  readonly levels: readonly SkillLevelThreshold[];
}

export interface ItemDefinition {
  readonly id: SkillLoopId;
  readonly categoryId: SkillLoopId;
  /** Present only on items that can be spent for a timed activity-speed effect. */
  readonly consumable?: ConsumableEffect;
}

export interface ConsumableEffect {
  /** 1150 = all activity cycles run 15% faster while the buff is active. */
  readonly speedMultiplierPermille?: number;
  /** 1150 = skill XP from completed cycles is 15% higher while active. */
  readonly xpMultiplierPermille?: number;
  /** Game-time duration; the advance loop decrements it alongside settlement. */
  readonly durationMs: number;
}

export interface OfflineFuelDefinition {
  readonly itemId: SkillLoopId;
  /** Offline cap extension granted per unit consumed. */
  readonly extensionMs: number;
  /** Hard ceiling for the total extension, regardless of stock. */
  readonly maxExtensionMs: number;
}

/** A fixed coin-for-materials offer; buying is an immediate command, not an activity. */
export interface ShopOffer {
  readonly id: SkillLoopId;
  readonly itemId: SkillLoopId;
  readonly amount: number;
  readonly coinCost: number;
  readonly requiredLevel?: number;
}

/** A fixed price offer for selling stock back for coins; repeatable, immediate, atomic. */
export interface SellOffer {
  readonly id: SkillLoopId;
  readonly itemId: SkillLoopId;
  readonly amount: number;
  readonly coinValue: number;
}

export interface ActiveBuff {
  readonly sourceItemId: SkillLoopId;
  /** Present when the source consumable speeds up activity cycles. */
  readonly speedMultiplierPermille?: number;
  /** Present when the source consumable boosts skill XP. */
  readonly xpMultiplierPermille?: number;
  readonly remainingMs: number;
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
  readonly schemaVersion: 1 | 2 | 3 | 4;
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
  /** Optional offline cap extension paid from stock; schema 3 content only. */
  readonly offlineFuel?: OfflineFuelDefinition;
  /** Fixed coin-for-materials offers; buying is an immediate command. */
  readonly shopOffers?: readonly ShopOffer[];
  /** Fixed price offers for selling stock back for coins; content 7.0.0 and later. */
  readonly sellOffers?: readonly SellOffer[];
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
  readonly schemaVersion: 1 | 2 | 3 | 4;
  readonly profileId: 'skill-prototype-v1';
  readonly contentVersion: string;
  readonly inventory: Readonly<Record<SkillLoopId, number>>;
  readonly skillXp: Readonly<Record<SkillLoopId, number>>;
  readonly toolLevels: Readonly<Record<SkillLoopId, number>>;
  readonly currentActivity: CurrentActivity | null;
  readonly lastSimulatedAt: number;
  readonly returnReport: SkillLoopReturnReport | null;
  /** At most one consumable buff is active; consuming refreshes it. Schema 3 and later. */
  readonly buffs?: readonly ActiveBuff[];
  /** Mastery XP per activity; schema 4 only, zero-initialised on migration. */
  readonly masteryXp?: Readonly<Record<SkillLoopId, number>>;
  /** Spendable mastery pool per skill; schema 4 only, zero-initialised on migration. */
  readonly masteryPool?: Readonly<Record<SkillLoopId, number>>;
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
  | { readonly kind: 'consume'; readonly itemId: SkillLoopId }
  | { readonly kind: 'purchase'; readonly offerId: SkillLoopId }
  | { readonly kind: 'sell'; readonly offerId: SkillLoopId }
  | {
      readonly kind: 'spend-mastery-pool';
      /** The activity whose mastery XP is topped up; it determines the owning skill's pool. */
      readonly activityId: SkillLoopId;
      /** Pool XP converted 1:1 into mastery XP; must fit the pool balance and the activity cap. */
      readonly amount: number;
    }
  | { readonly kind: 'acknowledge-return-report' };

export type SkillLoopErrorCode =
  | 'UNKNOWN_ACTIVITY'
  | 'UNKNOWN_UPGRADE'
  | 'UNKNOWN_ITEM'
  | 'UNKNOWN_OFFER'
  | 'UNKNOWN_SELL_OFFER'
  | 'NOT_CONSUMABLE'
  | 'LOCKED'
  | 'ACTIVITY_ALREADY_RUNNING'
  | 'NO_ACTIVITY_TO_PAUSE'
  | 'NO_ACTIVITY_TO_RESUME'
  | 'INSUFFICIENT_RESOURCES'
  | 'INSUFFICIENT_MASTERY_POOL'
  | 'MASTERY_POOL_CAP_EXCEEDED'
  | 'ALREADY_PURCHASED'
  /** The requested mastery-pool amount is not a positive safe integer; not an overflow. */
  | 'INVALID_MASTERY_AMOUNT'
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

/** Derived throughput of one activity at the current state; never persisted. */
export interface ActivityOutputRate {
  readonly itemId: SkillLoopId;
  readonly amountPerHour: number;
}

export interface ActivityRate {
  readonly activityId: SkillLoopId;
  readonly skillId: SkillLoopId;
  readonly cycleDurationMs: number;
  readonly cyclesPerHour: number;
  readonly outputsPerHour: readonly ActivityOutputRate[];
  readonly inputsPerHour: readonly ActivityOutputRate[];
  readonly xpPerHour: number;
}

/** Projection of what an absence yields; derived from state, never persisted. */
export interface OfflinePlan {
  readonly fuelItemId: SkillLoopId | null;
  readonly fuelExtensionMs: number;
  readonly fuelMaxExtensionMs: number;
  readonly fuelUnitsOwned: number;
  readonly fuelUnitsSpendable: number;
  readonly baseWindowMs: number;
  readonly maxWindowMs: number;
  /** Level-derived offline cap bonus already included in baseWindowMs; 0 without one. */
  readonly offlineCapBonusMs: number;
  readonly projectedCycles: number;
  readonly projectedOutputs: readonly MaterialAmount[];
  readonly projectedXp: number;
}

export type SkillLoopActionResult =
  | { readonly ok: true; readonly state: SkillLoopState }
  | { readonly ok: false; readonly state: SkillLoopState; readonly error: SkillLoopErrorCode };
