import { describe, expect, it } from 'vitest';
import { BASE_GAME_DEFINITION } from '../base-game';
import { EXPEDITION_DEFINITION } from '../expedition';
import { EXPEDITION_V13_DEFINITION } from '../expedition-v13';
import { STORY_V13_DEFINITION } from '../story-v13';
import { CLUE_COPY } from '../../themes/story-copy';
import { CLUE_COPY as CLUE_COPY_V13 } from '../../themes/story-copy-v13';
import {
  advanceExpedition,
  applyExpeditionCommand,
  createExpedition,
  getExpeditionSummary,
} from '../../domain/legacy/expedition/engine';
import type { ExpeditionCommand, SaveBundle } from '../../domain/legacy/expedition/types';
import { validateExpeditionDefinition } from '../../domain/legacy/expedition/validation';
import {
  decodeExpeditionSave,
  encodeExpeditionSave,
} from '../../persistence/legacy/expedition-codec';
import {
  STORY_ARCHIVE_PROJECTION,
  STORY_ARCHIVE_V13_PROJECTION,
  validateStoryArchiveProjection,
  type StoryArchiveRecord,
  type StoryArchiveReference,
} from './story-archive';

const copyIds = Object.keys(CLUE_COPY);
const v13Definition = EXPEDITION_V13_DEFINITION;
const V13_WORLD_ID = 'world-unlisted-city';

function commandV13(state: SaveBundle, value: ExpeditionCommand): SaveBundle {
  const result = applyExpeditionCommand(state, v13Definition, value);
  if (!result.ok) throw new Error(`Rejected v13 fixture command: ${value.kind}/${result.error}`);
  return result.state;
}

function advanceV13(state: SaveBundle, elapsedMs: number): SaveBundle {
  return advanceExpedition(state, v13Definition, state.lastSimulatedAt + elapsedMs);
}

function enterV13(contractId?: string, seed = 41): SaveBundle {
  return commandV13(createExpedition(v13Definition, 0), {
    kind: 'enter-world',
    worldId: V13_WORLD_ID,
    ...(contractId === undefined ? {} : { contractId }),
    seed,
  });
}

function prepareV13FirstWave(state: SaveBundle): SaveBundle {
  state = advanceV13(state, 90_000);
  return commandV13(state, { kind: 'build', buildingId: 'shelter' });
}

function completeV13CoreContract(): SaveBundle {
  let state = prepareV13FirstWave(enterV13());
  state = commandV13(state, { kind: 'fight-wave' });
  if (getExpeditionSummary(state, v13Definition).pendingEvents.length > 0) {
    state = commandV13(state, {
      kind: 'choose-event',
      eventId: 'event-anchor-tower-failure',
      optionId: 'option-repair-main-anchor',
    });
  }
  state = advanceV13(state, 120_000);
  return commandV13(state, { kind: 'fight-wave' });
}

describe('story archive projection', () => {
  it('projects every implemented story clue to its player-facing copy', () => {
    const entries = validateStoryArchiveProjection(
      EXPEDITION_DEFINITION,
      STORY_ARCHIVE_PROJECTION,
      copyIds,
    );

    expect(entries).toHaveLength(EXPEDITION_DEFINITION.story.clues.length);
    expect(entries.every((entry) => entry.clueId === entry.copyId)).toBe(true);
  });

  it('rejects an implemented clue that has not been reviewed into the projection', () => {
    expect(() =>
      validateStoryArchiveProjection(
        EXPEDITION_DEFINITION,
        STORY_ARCHIVE_PROJECTION.slice(1),
        copyIds,
      ),
    ).toThrow(/missing from archive projection/);
  });

  it('rejects a world reference that disagrees with the clue source', () => {
    const record = STORY_ARCHIVE_PROJECTION.find((entry) => entry.id === 'forest-signal');
    if (record === undefined) throw new Error('Missing forest signal projection fixture');
    const gameRefs: StoryArchiveReference[] = record.gameRefs.map((reference) =>
      reference.kind === 'world' ? { kind: 'world', id: 'ruins' } : reference,
    );
    const projection: StoryArchiveRecord[] = STORY_ARCHIVE_PROJECTION.map((entry) =>
      entry.id === record.id ? { ...entry, gameRefs } : entry,
    );

    expect(() =>
      validateStoryArchiveProjection(EXPEDITION_DEFINITION, projection, copyIds),
    ).toThrow(/world does not match clue source/);
  });

  it('rejects a dialogue reference that does not grant the projected clue', () => {
    const record = STORY_ARCHIVE_PROJECTION.find((entry) => entry.id === 'snow-order');
    if (record === undefined) throw new Error('Missing snow order projection fixture');
    const gameRefs: StoryArchiveReference[] = record.gameRefs.map((reference) =>
      reference.kind === 'dialogue' ? { kind: 'dialogue', id: 'keeper-debrief' } : reference,
    );
    const projection: StoryArchiveRecord[] = STORY_ARCHIVE_PROJECTION.map((entry) =>
      entry.id === record.id ? { ...entry, gameRefs } : entry,
    );

    expect(() =>
      validateStoryArchiveProjection(EXPEDITION_DEFINITION, projection, copyIds),
    ).toThrow(/dialogue does not grant clue/);
  });

  it('rejects references to missing theme copy', () => {
    const record = STORY_ARCHIVE_PROJECTION[0];
    if (record === undefined) throw new Error('Missing story archive projection fixture');
    const gameRefs: StoryArchiveReference[] = [
      ...record.gameRefs.filter((reference) => reference.kind !== 'theme-copy'),
      { kind: 'theme-copy', id: 'missing-copy' },
    ];
    const projection: StoryArchiveRecord[] = STORY_ARCHIVE_PROJECTION.map((entry) =>
      entry.id === record.id ? { ...entry, gameRefs } : entry,
    );

    expect(() =>
      validateStoryArchiveProjection(EXPEDITION_DEFINITION, projection, copyIds),
    ).toThrow(/missing theme copy/);
  });

  it('projects every approved v13 clue to its world or dialogue source and theme copy', () => {
    const entries = validateStoryArchiveProjection(
      EXPEDITION_V13_DEFINITION,
      STORY_ARCHIVE_V13_PROJECTION,
      Object.keys(CLUE_COPY_V13),
    );

    expect(entries).toHaveLength(EXPEDITION_V13_DEFINITION.story.clues.length);
    expect(entries.map((entry) => entry.clueId)).toEqual(
      EXPEDITION_V13_DEFINITION.story.clues.map((clue) => clue.id),
    );
  });

  it('rejects a schema-8 v12 file under v13 rules without changing the imported text', () => {
    const legacyRulesState = createExpedition(EXPEDITION_DEFINITION, 0);
    const source = encodeExpeditionSave(legacyRulesState);

    expect(() => decodeExpeditionSave(source, v13Definition, BASE_GAME_DEFINITION)).toThrow(
      '不支持此存档格式或内容版本',
    );
    expect(source).toBe(encodeExpeditionSave(legacyRulesState));
  });

  it('validates v13 IDs, story-thread links, and modifier origins', () => {
    expect(() => validateExpeditionDefinition(v13Definition)).not.toThrow();
    expect(STORY_V13_DEFINITION.storyThreads?.map((thread) => thread.id)).toEqual([
      'seventh-ring-call',
      'unlisted-households',
      'extra-ledger-page',
    ]);

    const invalid = {
      ...v13Definition,
      events: v13Definition.events.map((event) =>
        event.id === 'event-unlit-house-call'
          ? { ...event, storyThreadId: 'unknown-story-thread' }
          : event,
      ),
    };
    expect(() => validateExpeditionDefinition(invalid)).toThrow(/approved story thread/);
  });

  it('completes the core rescue without manual gathering and opens its permanent story response', () => {
    let state = completeV13CoreContract();
    expect(getExpeditionSummary(state, v13Definition).canReturn).toBe(true);
    expect(state.activeRun?.resourceLedger.collected).toEqual({ wood: 0, stone: 0 });
    state = commandV13(state, { kind: 'return' });
    expect(state.lastSettlement?.outcome).toBe('success');
    expect(state.profile.discoveredClueIds).toContain('clue-unlisted-rescue-receipt');
    expect(getExpeditionSummary(state, v13Definition).pendingDialogueIds).toContain(
      'dialogue-return-audit',
    );

    state = commandV13(state, {
      kind: 'choose-dialogue',
      dialogueId: 'dialogue-return-audit',
      optionId: 'option-reopen-rescue-case',
    });
    expect(state.profile.discoveredClueIds).toContain('clue-impossible-return-time');
    const nextRun = commandV13(state, {
      kind: 'enter-world',
      worldId: V13_WORLD_ID,
      contractId: 'contract-audit-missing-district',
      seed: 20,
    });
    expect(nextRun.activeRun?.resources).toEqual({ wood: 14, stone: 4 });
  });

  it('matches the early-battle preview to actual damage and stability loss', () => {
    let state = enterV13();
    state = advanceV13(state, 72_000);
    state = commandV13(state, { kind: 'build', buildingId: 'shelter' });
    const forecast = getExpeditionSummary(state, v13Definition);
    state = commandV13(state, { kind: 'fight-early' });

    expect(state.activeRun?.lastBattle?.damage).toBe(forecast.earlyPredictedDamage);
    expect(state.activeRun?.lastBattle?.initiativePoints).toBe(forecast.earlyBonus);
    expect(state.activeRun?.anchorCityState?.stability).toBe(78);
  });

  it('keeps the seeded audit incident stable through schema-8 restoration', () => {
    const returned = commandV13(completeV13CoreContract(), { kind: 'return' });
    const audit = commandV13(returned, {
      kind: 'enter-world',
      worldId: V13_WORLD_ID,
      contractId: 'contract-audit-missing-district',
      seed: 20,
    });
    const restored = decodeExpeditionSave(
      encodeExpeditionSave(audit),
      v13Definition,
      BASE_GAME_DEFINITION,
    );

    expect(audit.activeRun?.randomEventId).toBe('event-unlit-house-call');
    expect(restored.activeRun?.randomEventId).toBe(audit.activeRun?.randomEventId);
    expect(getExpeditionSummary(restored, v13Definition).pendingEvents).toHaveLength(0);
  });

  it('finishes the audit side project and archives its evidence after return', () => {
    let state = commandV13(completeV13CoreContract(), { kind: 'return' });
    const pointsBeforeAudit = state.profile.points;
    state = commandV13(state, {
      kind: 'enter-world',
      worldId: V13_WORLD_ID,
      contractId: 'contract-audit-missing-district',
      seed: 20,
    });
    state = advanceV13(state, 90_000);
    state = commandV13(state, { kind: 'build', buildingId: 'shelter' });
    state = commandV13(state, { kind: 'fight-wave' });
    expect(
      getExpeditionSummary(state, v13Definition).pendingEvents.map((event) => event.id),
    ).toEqual(['event-anchor-tower-failure', 'event-unlit-house-call']);
    state = commandV13(state, {
      kind: 'choose-event',
      eventId: 'event-anchor-tower-failure',
      optionId: 'option-use-backup-anchor',
    });
    state = commandV13(state, {
      kind: 'choose-event',
      eventId: 'event-unlit-house-call',
      optionId: 'option-send-auditor',
    });
    expect(getExpeditionSummary(state, v13Definition).availableProjectIds).toContain(
      'project-check-vacant-house',
    );
    state = commandV13(state, {
      kind: 'start-project',
      projectId: 'project-check-vacant-house',
      workerRole: 'wood',
    });
    state = advanceV13(state, 45_000);
    expect(state.activeRun?.completedProjectIds).toContain('project-check-vacant-house');
    expect(getExpeditionSummary(state, v13Definition).objectives).toContainEqual(
      expect.objectContaining({ objectiveId: 'objective-check-lamp-record', completed: true }),
    );

    state = advanceV13(state, 75_000);
    state = commandV13(state, { kind: 'fight-wave' });
    state = commandV13(state, { kind: 'return' });
    expect(state.lastSettlement?.completedObjectiveIds).toContain('objective-check-lamp-record');
    expect(state.lastSettlement?.points).toBe(20);
    expect(state.profile.discoveredClueIds).toContain('clue-household-lamp-record');
    expect(state.profile.points).toBe(pointsBeforeAudit + 20);
  });

  it('applies all three story-linked difficulty clauses and the top reward tier', () => {
    let state = createExpedition(v13Definition, 0);
    state = commandV13(state, {
      kind: 'select-difficulty-modifiers',
      worldId: V13_WORLD_ID,
      modifierIds: ['frozen-appropriation', 'early-tide', 'exposed-anchor'],
    });
    expect(getExpeditionSummary(state, v13Definition)).toMatchObject({
      difficultyScore: 5,
      difficultyReward: 12,
    });
    state = commandV13(state, { kind: 'enter-world', worldId: V13_WORLD_ID });
    expect(state.activeRun?.resources).toEqual({ wood: 6, stone: 3 });
    expect(getExpeditionSummary(state, v13Definition).stageRemainingMs).toBe(72_000);
    expect(getExpeditionSummary(state, v13Definition).nextWaveStrength).toBeCloseTo(25.3);
  });
});
