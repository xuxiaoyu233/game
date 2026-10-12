import { getSkillLoopSummary } from './engine';
import type { SkillLoopDefinition, SkillLoopState, SkillLoopReturnReport } from './types';

const MAXIMUM = Number.MAX_SAFE_INTEGER;

function boundedSum(left: number, right: number): number {
  return Math.max(-MAXIMUM, Math.min(MAXIMUM, left + right));
}

function reportReason(state: SkillLoopState): SkillLoopReturnReport['reason'] {
  const current = state.currentActivity;
  if (current === null) return 'no-activity';
  if (current.status === 'stopped' && current.stopReason === 'insufficient-materials')
    return 'insufficient-materials';
  if (current.status === 'paused') return 'paused';
  return 'continuing';
}

/** Attach a persisted, acknowledgement-only receipt to the one startup settlement. */
export function captureSkillLoopReturnReport(
  before: SkillLoopState,
  after: SkillLoopState,
  definition: SkillLoopDefinition,
): SkillLoopState {
  if (after.lastSimulatedAt <= before.lastSimulatedAt) return after;

  const inventoryDelta = Object.fromEntries(
    definition.items.map((item) => [
      item.id,
      (after.inventory[item.id] ?? 0) - (before.inventory[item.id] ?? 0),
    ]),
  );
  const skillXpDelta = Object.fromEntries(
    definition.skills.map((skill) => [
      skill.id,
      (after.skillXp[skill.id] ?? 0) - (before.skillXp[skill.id] ?? 0),
    ]),
  );
  const previousUnlocks = new Set(getSkillLoopSummary(before, definition).availableActivityIds);
  const unlockedActivityIds = getSkillLoopSummary(after, definition).availableActivityIds.filter(
    (activityId) => !previousUnlocks.has(activityId),
  );
  const stopChanged =
    before.currentActivity?.status !== after.currentActivity?.status ||
    before.currentActivity?.stopReason !== after.currentActivity?.stopReason;
  const hasGain =
    Object.values(inventoryDelta).some((delta) => delta !== 0) ||
    Object.values(skillXpDelta).some((delta) => delta !== 0) ||
    unlockedActivityIds.length > 0 ||
    stopChanged;

  if (!hasGain) return after;

  const previous = before.returnReport;
  const elapsedMs = after.lastSimulatedAt - before.lastSimulatedAt;
  const settlementWindowMs = Math.min(elapsedMs, definition.maxOfflineMs);
  const mergedInventoryDelta = Object.fromEntries(
    definition.items.map((item) => [
      item.id,
      boundedSum(previous?.inventoryDelta[item.id] ?? 0, inventoryDelta[item.id] ?? 0),
    ]),
  );
  const mergedSkillXpDelta = Object.fromEntries(
    definition.skills.map((skill) => [
      skill.id,
      boundedSum(previous?.skillXpDelta[skill.id] ?? 0, skillXpDelta[skill.id] ?? 0),
    ]),
  );
  const allUnlocks = new Set(previous?.unlockedActivityIds ?? []);
  for (const activityId of unlockedActivityIds) allUnlocks.add(activityId);

  const report: SkillLoopReturnReport = {
    elapsedMs: boundedSum(previous?.elapsedMs ?? 0, elapsedMs),
    settlementWindowMs: boundedSum(previous?.settlementWindowMs ?? 0, settlementWindowMs),
    offlineCapReached:
      (previous?.offlineCapReached ?? false) || elapsedMs > definition.maxOfflineMs,
    activityId: after.currentActivity?.activityId ?? before.currentActivity?.activityId ?? null,
    reason: reportReason(after),
    inventoryDelta: mergedInventoryDelta,
    skillXpDelta: mergedSkillXpDelta,
    unlockedActivityIds: [...allUnlocks],
  };
  return { ...after, returnReport: report };
}
