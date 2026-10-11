/** Stable identifiers describe mechanics, never translated labels or artwork. */
export type ContentId = string;

export interface ToolDefinition {
  readonly id: ContentId;
  readonly baseCost: number;
  readonly costGrowth: number;
  readonly productionRate: number;
  readonly unlockedByTaskId?: ContentId;
}

export type UpgradeEffect =
  | { readonly kind: 'click-multiplier'; readonly multiplier: number }
  | {
      readonly kind: 'tool-multiplier';
      readonly toolId: ContentId;
      readonly multiplier: number;
    };

export interface UpgradeDefinition {
  readonly id: ContentId;
  readonly cost: number;
  readonly effect: UpgradeEffect;
  readonly unlockedByTaskId?: ContentId;
  readonly requiredTool?: { readonly toolId: ContentId; readonly count: number };
}

export interface TaskDefinition {
  readonly id: ContentId;
  readonly previousTaskId?: ContentId;
  readonly totalGathered: number;
  readonly requiredTool: { readonly toolId: ContentId; readonly count: number };
  readonly reward: number;
}

export type EventEffect =
  | { readonly kind: 'resource-grant'; readonly amount: number }
  | { readonly kind: 'production-multiplier'; readonly multiplier: number };

export interface EventDefinition {
  readonly id: ContentId;
  readonly triggeredByTaskId: ContentId;
  readonly options: readonly {
    readonly id: ContentId;
    readonly effect: EventEffect;
  }[];
}

export interface GameDefinition {
  readonly contentVersion: string;
  readonly worldId: ContentId;
  readonly initialClickYield: number;
  readonly maxOfflineMs: number;
  readonly tools: readonly ToolDefinition[];
  readonly upgrades: readonly UpgradeDefinition[];
  readonly tasks: readonly TaskDefinition[];
  readonly events: readonly EventDefinition[];
}

export interface GameState {
  readonly schemaVersion: 1;
  readonly contentVersion: string;
  readonly worldId: ContentId;
  readonly balance: number;
  readonly totalGathered: number;
  readonly toolCounts: Readonly<Record<ContentId, number>>;
  readonly purchasedUpgradeIds: readonly ContentId[];
  readonly claimedTaskIds: readonly ContentId[];
  readonly eventChoices: Readonly<Record<ContentId, ContentId>>;
  readonly lastSimulatedAt: number;
}

export type GameCommand =
  | { readonly kind: 'tick' }
  | { readonly kind: 'collect' }
  | { readonly kind: 'buy-tool'; readonly toolId: ContentId }
  | { readonly kind: 'buy-upgrade'; readonly upgradeId: ContentId }
  | { readonly kind: 'claim-task'; readonly taskId: ContentId }
  | {
      readonly kind: 'choose-event';
      readonly eventId: ContentId;
      readonly optionId: ContentId;
    };

export type GameErrorCode =
  | 'INSUFFICIENT_MATERIALS'
  | 'LOCKED'
  | 'ALREADY_PURCHASED'
  | 'TASK_NOT_READY'
  | 'ALREADY_CLAIMED'
  | 'EVENT_NOT_PENDING'
  | 'UNKNOWN_ID'
  | 'NUMERIC_LIMIT';

export type ActionResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly state: GameState; readonly error: GameErrorCode };

export interface TimeAdvanceResult {
  readonly state: GameState;
  readonly productionGained: number;
  readonly elapsedMs: number;
  readonly creditedMs: number;
  readonly error?: 'NUMERIC_LIMIT';
}

export interface GameSummary {
  readonly productionRate: number;
  readonly clickYield: number;
  readonly toolPrices: Readonly<Record<ContentId, number>>;
  readonly availableToolIds: readonly ContentId[];
  readonly availableUpgradeIds: readonly ContentId[];
  readonly readyTaskIds: readonly ContentId[];
  readonly pendingEventIds: readonly ContentId[];
  readonly isCompleted: boolean;
}
