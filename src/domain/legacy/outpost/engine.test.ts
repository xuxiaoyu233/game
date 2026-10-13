import { describe, expect, it } from 'vitest';
import { EXPEDITION_V14_DEFINITION } from '../../../content/expedition-v14';
import {
  applyOutpostCommand,
  advanceOutpost,
  createOutpost,
  getOutpostProfessionLevel,
  getOutpostProfessionExperienceSinceReview,
  getOutpostProfessionProgress,
  getOutpostResourceCapacity,
  getOutpostStorageCapacity,
  OUTPOST_RESOURCE_IDS,
  validateOutpostState,
} from './engine';
import type { OutpostCommand } from './types';
import type { OutpostDefinition } from './types';

function requireDefinition(): OutpostDefinition {
  const selected = EXPEDITION_V14_DEFINITION.outpost;
  if (selected === undefined) throw new Error('Missing v14 outpost definition');
  return selected;
}
const definition = requireDefinition();

function act(
  state: ReturnType<typeof createOutpost>,
  command: OutpostCommand,
  clues: readonly string[] = [],
) {
  const result = applyOutpostCommand(state, definition, command, clues);
  if (!result.ok) throw new Error(`Unexpected outpost rejection: ${result.error}`);
  return result.state;
}

describe('outpost economy', () => {
  it('conserves workers and computes persistent production from assigned jobs', () => {
    const initial = createOutpost(definition);
    expect(initial.jobAssignments).toEqual({
      'recover-alloy': 1,
      'recover-cells': 1,
      'cultivate-biofiber': 1,
    });
    const produced = advanceOutpost(initial, definition, 0, 3_600_000).resources;
    expect(produced['reclaimed-alloy']).toBeCloseTo(18);
    expect(produced['charge-cell']).toBeCloseTo(18);
    expect(produced.biofiber).toBeCloseTo(12);
    const invalid = applyOutpostCommand(
      initial,
      definition,
      {
        kind: 'set-outpost-workers',
        assignments: { 'recover-alloy': 2, 'recover-cells': 2, 'cultivate-biofiber': 0 },
      },
      [],
    );
    expect(invalid).toMatchObject({ ok: false, error: 'OUTPOST_WORKERS', state: initial });
  });

  it('stops a job exactly at its stock target and resumes when the target is raised', () => {
    let state = act(createOutpost(definition), {
      kind: 'set-outpost-job-target',
      jobId: 'recover-alloy',
      target: 20,
    });
    state = advanceOutpost(state, definition, 0, 2 * 3_600_000);
    expect(state.resources['reclaimed-alloy']).toBe(20);
    expect(state.producedByJob['recover-alloy']).toBeCloseTo(8);
    state = advanceOutpost(state, definition, 2 * 3_600_000, 3 * 3_600_000);
    expect(state.resources['reclaimed-alloy']).toBe(20);
    state = act(state, {
      kind: 'set-outpost-job-target',
      jobId: 'recover-alloy',
      target: 26,
    });
    state = advanceOutpost(state, definition, 3 * 3_600_000, 4 * 3_600_000);
    expect(state.resources['reclaimed-alloy']).toBe(26);
  });

  it('rejects unreachable new stock targets and permits them after storage expansion', () => {
    const initial = createOutpost(definition);
    expect(getOutpostResourceCapacity(initial, definition, 'biofiber')).toBe(80);
    expect(
      applyOutpostCommand(
        initial,
        definition,
        { kind: 'set-outpost-job-target', jobId: 'cultivate-biofiber', target: 100 },
        [],
      ),
    ).toMatchObject({ ok: false, error: 'OUTPOST_TARGET_CAPACITY', state: initial });

    const expanded = buildFirstHangarFromStartingEconomy(initial);
    expect(getOutpostResourceCapacity(expanded, definition, 'biofiber')).toBe(120);
    expect(
      applyOutpostCommand(
        expanded,
        definition,
        { kind: 'set-outpost-job-target', jobId: 'cultivate-biofiber', target: 100 },
        [],
      ),
    ).toMatchObject({ ok: true, state: { jobTargets: { 'cultivate-biofiber': 100 } } });

    const legacyTarget = {
      ...initial,
      jobTargets: { ...initial.jobTargets, 'cultivate-biofiber': 100 },
    };
    expect(() => validateOutpostState(legacyTarget, definition)).not.toThrow();
    expect(
      act(legacyTarget, {
        kind: 'set-outpost-job-target',
        jobId: 'cultivate-biofiber',
        target: 60,
      }).jobTargets['cultivate-biofiber'],
    ).toBe(60);
  });

  it('can recover a full warehouse by atomically reserving recipe inputs before output space', () => {
    const expanded = buildFirstHangarFromStartingEconomy(createOutpost(definition));
    const full = {
      ...expanded,
      resources: {
        ...expanded.resources,
        'reclaimed-alloy': 140,
        'charge-cell': 140,
        biofiber: 120,
      },
      professionExperience: { ...expanded.professionExperience, engineering: 1 },
    };
    expect(OUTPOST_RESOURCE_IDS.reduce((total, id) => total + full.resources[id], 0)).toBe(400);
    const started = applyOutpostCommand(
      full,
      definition,
      { kind: 'start-outpost-recipe', recipeId: 'refine-structural-panel', batches: 1 },
      [],
    );
    expect(started).toMatchObject({
      ok: true,
      state: {
        resources: { 'reclaimed-alloy': 137, 'charge-cell': 139 },
        reservedOutput: 'structural-panel',
        pausedReason: null,
      },
    });
  });

  it('crafts and spends a structural panel to build the first production facility', () => {
    const initial = createOutpost(definition);
    expect(
      applyOutpostCommand(
        initial,
        definition,
        { kind: 'build-outpost-facility', facilityId: 'production-hangar' },
        [],
      ),
    ).toMatchObject({ ok: false, error: 'OUTPOST_RESOURCES', state: initial });

    const queued = act(initial, {
      kind: 'start-outpost-recipe',
      recipeId: 'refine-structural-panel',
      batches: 1,
    });
    const crafted = advanceOutpost(queued, definition, 0, 180_000);
    expect(crafted.resources['structural-panel']).toBe(1);
    expect(crafted.craftedByRecipe['refine-structural-panel']).toBe(1);

    const built = act(crafted, {
      kind: 'build-outpost-facility',
      facilityId: 'production-hangar',
    });
    expect(built).toMatchObject({
      facilities: { 'production-hangar': 1 },
      resources: { 'charge-cell': 5, 'structural-panel': 0 },
    });
    expect(built.resources['reclaimed-alloy']).toBeCloseTo(1.3);
    expect(getOutpostStorageCapacity(built, definition)).toBe(400);
    const duplicate = applyOutpostCommand(
      built,
      definition,
      { kind: 'build-outpost-facility', facilityId: 'production-hangar' },
      [],
    );
    expect(duplicate).toMatchObject({ ok: false, error: 'OUTPOST_FACILITY_MAX', state: built });
    const stocked = advanceOutpost(built, definition, 0, 30 * 3_600_000);
    expect(OUTPOST_RESOURCE_IDS.reduce((total, id) => total + stocked.resources[id], 0)).toBe(400);
  });

  it('produces the same result across one offline interval and sixty one-minute updates', () => {
    const queued = act(createOutpost(definition), {
      kind: 'start-outpost-recipe',
      recipeId: 'refine-structural-panel',
      batches: 5,
    });
    const offline = advanceOutpost(queued, definition, 0, 3_600_000);
    let online = queued;
    for (let minute = 1; minute <= 60; minute += 1)
      online = advanceOutpost(online, definition, (minute - 1) * 60_000, minute * 60_000);
    expect(online).toEqual(offline);
  });

  it('keeps a review boundary so a return summary can be acknowledged without changing inventory', () => {
    const produced = advanceOutpost(createOutpost(definition), definition, 0, 3_600_000);
    expect(getOutpostProfessionExperienceSinceReview(produced, definition)).toEqual({
      salvage: 6,
      engineering: 6,
      medical: 6,
    });
    const acknowledged = act(produced, { kind: 'acknowledge-outpost-report' });
    expect(acknowledged.resources).toEqual(produced.resources);
    expect(acknowledged.reviewedProductionByJob).toEqual(produced.producedByJob);
    expect(acknowledged.reviewedCraftedByRecipe).toEqual(produced.craftedByRecipe);
    expect(getOutpostProfessionExperienceSinceReview(acknowledged, definition)).toEqual({
      salvage: 0,
      engineering: 0,
      medical: 0,
    });
  });

  it('reserves ingredients atomically, completes a batch, and preserves it across state snapshots', () => {
    const queued = act(createOutpost(definition), {
      kind: 'start-outpost-recipe',
      recipeId: 'refine-structural-panel',
      batches: 1,
    });
    expect(queued.resources).toMatchObject({ 'reclaimed-alloy': 9, 'charge-cell': 9 });
    expect(queued.reservedOutput).toBe('structural-panel');
    const restored = structuredClone(queued);
    const finished = advanceOutpost(restored, definition, 0, 180_000);
    expect(finished.resources['structural-panel']).toBe(1);
    expect(finished.craftedByRecipe['refine-structural-panel']).toBe(1);
    expect(finished.remainingBatches).toBe(0);
    expect(finished.pausedReason).toBe('target-reached');
  });

  it('requires an assigned professional for crafting and keeps that worker through a reserved batch', () => {
    const unstaffed = act(createOutpost(definition), {
      kind: 'set-outpost-workers',
      assignments: { 'recover-alloy': 3, 'recover-cells': 0, 'cultivate-biofiber': 0 },
    });
    const waiting = act(unstaffed, {
      kind: 'start-outpost-recipe',
      recipeId: 'refine-structural-panel',
      batches: 1,
    });
    expect(waiting).toMatchObject({ pausedReason: 'workers', reservedOutput: null });
    const staffed = act(waiting, {
      kind: 'set-outpost-workers',
      assignments: { 'recover-alloy': 2, 'recover-cells': 1, 'cultivate-biofiber': 0 },
    });
    const started = advanceOutpost(staffed, definition, 0, 1);
    expect(started.reservedOutput).toBe('structural-panel');
    const reassigned = applyOutpostCommand(
      started,
      definition,
      {
        kind: 'set-outpost-workers',
        assignments: { 'recover-alloy': 3, 'recover-cells': 0, 'cultivate-biofiber': 0 },
      },
      [],
    );
    expect(reassigned).toMatchObject({ ok: false, error: 'OUTPOST_WORKERS', state: started });
  });

  it('returns reserved inputs on cancellation and waits visibly when ingredients are missing', () => {
    const started = act(createOutpost(definition), {
      kind: 'start-outpost-recipe',
      recipeId: 'refine-structural-panel',
      batches: null,
    });
    const stopped = act(started, { kind: 'stop-outpost-recipe' });
    expect(stopped.resources).toEqual(createOutpost(definition).resources);
    const experienced = advanceOutpost(createOutpost(definition), definition, 0, 2 * 3_600_000);
    const waiting = act(experienced, {
      kind: 'start-outpost-recipe',
      recipeId: 'assemble-barrier-kit',
      batches: 5,
    });
    expect(waiting.pausedReason).toBe('ingredients');
    expect(advanceOutpost(waiting, definition, 0, 3_600_000).resources['structural-panel']).toBe(0);
  });

  it('unlocks profession tiers from completed production and keeps rare-material recipes behind archived evidence', () => {
    let state = createOutpost(definition);
    expect(getOutpostProfessionLevel(state, definition, 'engineering')).toBe(1);
    state = advanceOutpost(state, definition, 0, 4 * 3_600_000);
    expect(getOutpostProfessionLevel(state, definition, 'engineering')).toBe(3);
    const locked = applyOutpostCommand(
      state,
      definition,
      {
        kind: 'start-outpost-recipe',
        recipeId: 'assemble-anchor-frame',
        batches: 1,
      },
      [],
    );
    if (locked.ok) throw new Error('Anchor frame must require the archived clue.');
    expect(locked.error).toBe('OUTPOST_RECIPE_LOCKED');
    const unlocked = applyOutpostCommand(
      state,
      definition,
      {
        kind: 'start-outpost-recipe',
        recipeId: 'assemble-anchor-frame',
        batches: 1,
      },
      ['clue-unlisted-rescue-receipt'],
    );
    expect(unlocked.ok).toBe(true);
    if (unlocked.ok) expect(unlocked.state.pausedReason).toBe('ingredients');
  });

  it('shows engineering progress toward the next recipe after offline production', () => {
    const state = advanceOutpost(createOutpost(definition), definition, 0, 80 * 60_000);
    expect(getOutpostProfessionProgress(state, definition, 'engineering')).toEqual({
      level: 2,
      experience: 8,
      currentLevelExperience: 8,
      nextLevelExperience: 24,
    });
    expect(state.professionExperience.engineering).toBe(8);
  });
});

function buildFirstHangarFromStartingEconomy(state: ReturnType<typeof createOutpost>) {
  const queued = act(state, {
    kind: 'start-outpost-recipe',
    recipeId: 'refine-structural-panel',
    batches: 1,
  });
  const crafted = advanceOutpost(queued, definition, 0, 180_000);
  return act(crafted, { kind: 'build-outpost-facility', facilityId: 'production-hangar' });
}
