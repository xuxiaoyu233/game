import { EXPEDITION_DEFINITION } from '../../src/content/expedition';
import { applyExpeditionCommand, createExpedition } from '../../src/domain/expedition/engine';
import type { SaveBundle as Version2Save } from '../../src/domain/expedition/v2-types';

/** A v2 first journey, with no v3 strategy or ledger fields. */
export function version2Starting(): Version2Save {
  const result = applyExpeditionCommand(
    createExpedition(EXPEDITION_DEFINITION, 0),
    EXPEDITION_DEFINITION,
    { kind: 'enter-world', worldId: 'forest' },
  );
  if (!result.ok || !result.state.activeRun) throw new Error('Expected expedition');
  const run = result.state.activeRun;
  return {
    ...result.state,
    schemaVersion: 2,
    contentVersion: '2.0.0',
    lastSettlement: null,
    activeRun: {
      sequence: run.sequence,
      worldId: run.worldId,
      phase: run.phase,
      resources: run.resources,
      buildings: run.buildings,
      hp: run.hp,
      maxHp: run.maxHp,
      clearedWaves: run.clearedWaves,
      elapsedInStageMs: run.elapsedInStageMs,
      gatherAvailableAt: run.gatherAvailableAt,
      beaconChoice: run.beaconChoice,
      boostedFinal: run.boostedFinal,
      repairUsed: run.repairUsed,
      recoveredClueIds: run.recoveredClueIds,
      lastBattle: null,
    },
  };
}
