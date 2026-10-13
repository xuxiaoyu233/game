import type {
  OutpostCommand,
  OutpostDefinition,
  OutpostErrorCode,
  OutpostFacilityId,
  OutpostJobId,
  OutpostProfessionId,
  OutpostRecipeDefinition,
  OutpostRecipeId,
  OutpostResourceId,
  OutpostResources,
  OutpostState,
} from './types';

export const OUTPOST_JOB_IDS: readonly OutpostJobId[] = [
  'recover-alloy',
  'recover-cells',
  'cultivate-biofiber',
];

export const OUTPOST_PROFESSION_IDS: readonly OutpostProfessionId[] = [
  'salvage',
  'engineering',
  'medical',
];

export const OUTPOST_RECIPE_IDS: readonly OutpostRecipeId[] = [
  'refine-structural-panel',
  'assemble-barrier-kit',
  'prepare-medical-kit',
  'assemble-anchor-frame',
];

export const OUTPOST_FACILITY_IDS: readonly OutpostFacilityId[] = ['production-hangar'];

export const OUTPOST_RESOURCE_IDS: readonly OutpostResourceId[] = [
  'reclaimed-alloy',
  'charge-cell',
  'biofiber',
  'structural-panel',
  'barrier-kit',
  'medical-kit',
  'anchor-shard',
  'echo-record',
  'anchor-frame',
];
const SIMULATION_STEP_MS = 60_000;

function emptyResources(): OutpostResources {
  return {
    'reclaimed-alloy': 0,
    'charge-cell': 0,
    biofiber: 0,
    'structural-panel': 0,
    'barrier-kit': 0,
    'medical-kit': 0,
    'anchor-shard': 0,
    'echo-record': 0,
    'anchor-frame': 0,
  };
}

function emptyJobNumbers(): Record<OutpostJobId, number> {
  return { 'recover-alloy': 0, 'recover-cells': 0, 'cultivate-biofiber': 0 };
}

function emptyRecipeNumbers(): OutpostState['craftedByRecipe'] {
  return {
    'refine-structural-panel': 0,
    'assemble-barrier-kit': 0,
    'prepare-medical-kit': 0,
    'assemble-anchor-frame': 0,
  };
}

export function createOutpost(definition: OutpostDefinition): OutpostState {
  return {
    resources: { ...definition.startingResources },
    jobAssignments: {
      'recover-alloy': 1,
      'recover-cells': 1,
      'cultivate-biofiber': 1,
    },
    jobTargets: {
      'recover-alloy': null,
      'recover-cells': null,
      'cultivate-biofiber': null,
    },
    facilities: { 'production-hangar': 0 },
    reviewedProductionByJob: emptyJobNumbers(),
    reviewedCraftedByRecipe: emptyRecipeNumbers(),
    activeRecipeId: null,
    remainingBatches: null,
    recipeProgressMs: 0,
    reservedInputs: emptyResources(),
    reservedOutput: null,
    professionExperience: { salvage: 0, engineering: 0, medical: 0 },
    producedByJob: emptyJobNumbers(),
    craftedByRecipe: emptyRecipeNumbers(),
    pausedReason: null,
  };
}

export function getOutpostProfessionLevel(
  state: OutpostState,
  definition: OutpostDefinition,
  professionId: OutpostProfessionId,
): number {
  const experience = state.professionExperience[professionId];
  let level = 0;
  for (const threshold of definition.professionLevelExperience) {
    if (experience < threshold) break;
    level += 1;
  }
  return level;
}

export interface OutpostProfessionProgress {
  readonly level: number;
  readonly experience: number;
  readonly currentLevelExperience: number;
  readonly nextLevelExperience: number | null;
}

export function getOutpostProfessionProgress(
  state: OutpostState,
  definition: OutpostDefinition,
  professionId: OutpostProfessionId,
): OutpostProfessionProgress {
  const level = getOutpostProfessionLevel(state, definition, professionId);
  return {
    level,
    experience: state.professionExperience[professionId],
    currentLevelExperience: definition.professionLevelExperience[level - 1] ?? 0,
    nextLevelExperience: definition.professionLevelExperience[level] ?? null,
  };
}

export function getOutpostProfessionExperienceSinceReview(
  state: OutpostState,
  definition: OutpostDefinition,
): Readonly<Record<OutpostProfessionId, number>> {
  const experience: Record<OutpostProfessionId, number> = {
    salvage: 0,
    engineering: 0,
    medical: 0,
  };
  for (const job of definition.jobs) {
    const produced = Math.max(
      0,
      state.producedByJob[job.id] - state.reviewedProductionByJob[job.id],
    );
    experience[job.professionId] +=
      (produced * job.experiencePerWorkerHour) / job.amountPerWorkerHour;
  }
  for (const recipe of definition.recipes) {
    const batches = Math.max(
      0,
      state.craftedByRecipe[recipe.id] - state.reviewedCraftedByRecipe[recipe.id],
    );
    experience[recipe.professionId] += batches * definition.experiencePerBatch;
  }
  for (const professionId of OUTPOST_PROFESSION_IDS)
    experience[professionId] = Math.round(experience[professionId] * 1_000_000) / 1_000_000;
  return experience;
}

export function consumeOutpostResource(
  state: OutpostState,
  resourceId: OutpostResourceId,
  amount: number,
): OutpostState | null {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new RangeError('Outpost resource consumption must be a positive safe integer');
  if (state.resources[resourceId] < amount) return null;
  return {
    ...state,
    resources: { ...state.resources, [resourceId]: state.resources[resourceId] - amount },
  };
}

function findRecipe(
  definition: OutpostDefinition,
  recipeId: string,
): OutpostRecipeDefinition | undefined {
  return definition.recipes.find((recipe) => recipe.id === recipeId);
}

function available(
  recipe: OutpostRecipeDefinition,
  state: OutpostState,
  clues: readonly string[],
  definition: OutpostDefinition,
): boolean {
  return (
    getOutpostProfessionLevel(state, definition, recipe.professionId) >=
      recipe.minimumProfessionLevel &&
    recipe.requiredClueIds.every((clueId) => clues.includes(clueId))
  );
}

function hasRecipeWorker(
  state: OutpostState,
  definition: OutpostDefinition,
  recipe: OutpostRecipeDefinition,
): boolean {
  return definition.jobs.some(
    (job) => job.professionId === recipe.professionId && state.jobAssignments[job.id] > 0,
  );
}

function storedTotal(resources: OutpostResources): number {
  return OUTPOST_RESOURCE_IDS.reduce((sum, id) => sum + resources[id], 0);
}

export function getOutpostStorageCapacity(
  state: OutpostState,
  definition: OutpostDefinition,
): number {
  return (
    definition.storageCapacity +
    definition.facilities.reduce(
      (bonus, facility) => bonus + facility.storageCapacityBonus * state.facilities[facility.id],
      0,
    )
  );
}

export function getOutpostResourceCapacity(
  state: OutpostState,
  definition: OutpostDefinition,
  resourceId: OutpostResourceId,
): number {
  return (
    definition.resourceCaps[resourceId] +
    definition.facilities.reduce(
      (bonus, facility) => bonus + facility.resourceCapacityBonus * state.facilities[facility.id],
      0,
    )
  );
}

function hasInputs(state: OutpostState, recipe: OutpostRecipeDefinition): boolean {
  return Object.entries(recipe.inputs).every(
    ([id, amount]) => state.resources[id as OutpostResourceId] >= (amount ?? 0),
  );
}

function startBatch(
  state: OutpostState,
  definition: OutpostDefinition,
): Pick<OutpostState, 'resources' | 'reservedInputs' | 'reservedOutput' | 'pausedReason'> {
  if (state.activeRecipeId === null) {
    return {
      resources: state.resources,
      reservedInputs: emptyResources(),
      reservedOutput: null,
      pausedReason: null,
    };
  }
  const recipe = findRecipe(definition, state.activeRecipeId);
  if (recipe === undefined) throw new Error(`Unknown outpost recipe ${state.activeRecipeId}`);
  if (state.reservedOutput !== null)
    return {
      resources: state.resources,
      reservedInputs: state.reservedInputs,
      reservedOutput: state.reservedOutput,
      pausedReason: null,
    };
  if (state.remainingBatches === 0)
    return {
      resources: state.resources,
      reservedInputs: emptyResources(),
      reservedOutput: null,
      pausedReason: 'target-reached',
    };
  if (!hasRecipeWorker(state, definition, recipe))
    return {
      resources: state.resources,
      reservedInputs: emptyResources(),
      reservedOutput: null,
      pausedReason: 'workers',
    };
  if (!hasInputs(state, recipe))
    return {
      resources: state.resources,
      reservedInputs: emptyResources(),
      reservedOutput: null,
      pausedReason: 'ingredients',
    };
  const nextResources = { ...state.resources };
  const reservedInputs: Record<OutpostResourceId, number> = { ...emptyResources() };
  for (const [id, amount] of Object.entries(recipe.inputs)) {
    const resourceId = id as OutpostResourceId;
    const value = amount ?? 0;
    nextResources[resourceId] -= value;
    reservedInputs[resourceId] = value;
  }
  if (
    nextResources[recipe.output] + recipe.outputAmount >
      getOutpostResourceCapacity(state, definition, recipe.output) ||
    storedTotal(nextResources) + recipe.outputAmount > getOutpostStorageCapacity(state, definition)
  ) {
    return {
      resources: state.resources,
      reservedInputs: emptyResources(),
      reservedOutput: null,
      pausedReason: 'storage',
    };
  }
  return {
    resources: nextResources,
    reservedInputs,
    reservedOutput: recipe.output,
    pausedReason: null,
  };
}

export function applyOutpostCommand(
  state: OutpostState,
  definition: OutpostDefinition,
  command: OutpostCommand,
  clues: readonly string[],
):
  | { readonly ok: true; readonly state: OutpostState }
  | { readonly ok: false; readonly state: OutpostState; readonly error: OutpostErrorCode } {
  switch (command.kind) {
    case 'set-outpost-workers': {
      const assignmentValues = OUTPOST_JOB_IDS.map((id) => command.assignments[id]);
      if (
        Object.keys(command.assignments).length !== OUTPOST_JOB_IDS.length ||
        OUTPOST_JOB_IDS.some((id) => !Object.hasOwn(command.assignments, id)) ||
        assignmentValues.some((amount) => !Number.isSafeInteger(amount) || amount < 0) ||
        assignmentValues.reduce((sum, amount) => sum + amount, 0) !== definition.population
      )
        return { ok: false, state, error: 'OUTPOST_WORKERS' };
      if (state.activeRecipeId !== null && state.reservedOutput !== null) {
        const recipe = findRecipe(definition, state.activeRecipeId);
        const assignedRecipeWorkers = definition.jobs
          .filter((job) => job.professionId === recipe?.professionId)
          .reduce((sum, job) => sum + command.assignments[job.id], 0);
        if (assignedRecipeWorkers < 1) return { ok: false, state, error: 'OUTPOST_WORKERS' };
      }
      return { ok: true, state: { ...state, jobAssignments: { ...command.assignments } } };
    }
    case 'set-outpost-job-target': {
      if (
        !OUTPOST_JOB_IDS.includes(command.jobId) ||
        (command.target !== null && (!Number.isSafeInteger(command.target) || command.target < 1))
      )
        return { ok: false, state, error: 'OUTPOST_RECIPE_TARGET' };
      const job = definition.jobs.find((item) => item.id === command.jobId);
      if (
        command.target !== null &&
        job !== undefined &&
        command.target > getOutpostResourceCapacity(state, definition, job.output)
      )
        return { ok: false, state, error: 'OUTPOST_TARGET_CAPACITY' };
      return {
        ok: true,
        state: {
          ...state,
          jobTargets: { ...state.jobTargets, [command.jobId]: command.target },
        },
      };
    }
    case 'acknowledge-outpost-report':
      return {
        ok: true,
        state: {
          ...state,
          reviewedProductionByJob: { ...state.producedByJob },
          reviewedCraftedByRecipe: { ...state.craftedByRecipe },
        },
      };
    case 'build-outpost-facility': {
      const facility = definition.facilities.find((item) => item.id === command.facilityId);
      if (facility === undefined) return { ok: false, state, error: 'OUTPOST_FACILITY_UNKNOWN' };
      if (state.facilities[facility.id] >= facility.maxCount)
        return { ok: false, state, error: 'OUTPOST_FACILITY_MAX' };
      const canPay = Object.entries(facility.cost).every(
        ([id, amount]) => state.resources[id as OutpostResourceId] >= (amount ?? 0),
      );
      if (!canPay) return { ok: false, state, error: 'OUTPOST_RESOURCES' };
      const resources = { ...state.resources };
      for (const [id, amount] of Object.entries(facility.cost))
        resources[id as OutpostResourceId] -= amount ?? 0;
      return {
        ok: true,
        state: {
          ...state,
          resources,
          facilities: { ...state.facilities, [facility.id]: state.facilities[facility.id] + 1 },
        },
      };
    }
    case 'start-outpost-recipe': {
      if (
        command.batches !== null &&
        (!Number.isSafeInteger(command.batches) || command.batches < 1)
      )
        return { ok: false, state, error: 'OUTPOST_RECIPE_TARGET' };
      const recipe = findRecipe(definition, command.recipeId);
      if (recipe === undefined) return { ok: false, state, error: 'OUTPOST_RECIPE_UNKNOWN' };
      if (!available(recipe, state, clues, definition))
        return { ok: false, state, error: 'OUTPOST_RECIPE_LOCKED' };
      const replaced = state.activeRecipeId === null ? state : stopOutpostRecipe(state);
      const queued: OutpostState = {
        ...replaced,
        activeRecipeId: recipe.id,
        remainingBatches: command.batches,
        recipeProgressMs: 0,
        reservedInputs: emptyResources(),
        reservedOutput: null,
        pausedReason: null,
      };
      return { ok: true, state: { ...queued, ...startBatch(queued, definition) } };
    }
    case 'stop-outpost-recipe':
      return { ok: true, state: stopOutpostRecipe(state) };
    default:
      return { ok: false, state, error: 'OUTPOST_RECIPE_UNKNOWN' };
  }
}

function stopOutpostRecipe(state: OutpostState): OutpostState {
  const resources = { ...state.resources };
  for (const id of OUTPOST_RESOURCE_IDS) resources[id] += state.reservedInputs[id];
  return {
    ...state,
    resources,
    activeRecipeId: null,
    remainingBatches: null,
    recipeProgressMs: 0,
    reservedInputs: emptyResources(),
    reservedOutput: null,
    pausedReason: null,
  };
}

function addProduction(
  state: OutpostState,
  definition: OutpostDefinition,
  elapsedMs: number,
): OutpostState {
  let resources = { ...state.resources };
  const experience = { ...state.professionExperience };
  const producedByJob = { ...state.producedByJob };
  const activeRecipe =
    state.activeRecipeId === null ? undefined : findRecipe(definition, state.activeRecipeId);
  const reservedSpace =
    state.reservedOutput === null || activeRecipe === undefined ? 0 : activeRecipe.outputAmount;
  for (const job of definition.jobs) {
    const count = state.jobAssignments[job.id];
    const effectiveWorkers = Math.max(
      0,
      count -
        (state.reservedOutput !== null && activeRecipe?.professionId === job.professionId ? 1 : 0),
    );
    const target = state.jobTargets[job.id];
    const roomByTarget =
      target === null ? Number.POSITIVE_INFINITY : Math.max(0, target - resources[job.output]);
    const requested = Math.min(
      job.amountPerWorkerHour * effectiveWorkers * (elapsedMs / 3_600_000),
      roomByTarget,
    );
    const roomByResource = Math.max(
      0,
      getOutpostResourceCapacity(state, definition, job.output) - resources[job.output],
    );
    const roomByStorage = Math.max(
      0,
      getOutpostStorageCapacity(state, definition) - storedTotal(resources) - reservedSpace,
    );
    const gained = Math.min(requested, roomByResource, roomByStorage);
    if (gained <= 0) continue;
    resources = { ...resources, [job.output]: resources[job.output] + gained };
    producedByJob[job.id] += gained;
    const gainedExperience = (gained * job.experiencePerWorkerHour) / job.amountPerWorkerHour;
    experience[job.professionId] = Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.round((experience[job.professionId] + gainedExperience) * 1_000_000) / 1_000_000,
    );
  }
  return { ...state, resources, professionExperience: experience, producedByJob };
}

function finishBatch(state: OutpostState, definition: OutpostDefinition): OutpostState {
  const recipeId = state.activeRecipeId;
  const output = state.reservedOutput;
  if (recipeId === null || output === null) return state;
  const recipe = findRecipe(definition, recipeId);
  if (recipe === undefined) throw new Error(`Unknown outpost recipe ${recipeId}`);
  const craftedByRecipe = {
    ...state.craftedByRecipe,
    [recipeId]: state.craftedByRecipe[recipeId] + 1,
  };
  const professionExperience = {
    ...state.professionExperience,
    [recipe.professionId]: Math.min(
      Number.MAX_SAFE_INTEGER,
      state.professionExperience[recipe.professionId] + definition.experiencePerBatch,
    ),
  };
  const remainingBatches = state.remainingBatches === null ? null : state.remainingBatches - 1;
  return {
    ...state,
    resources: { ...state.resources, [output]: state.resources[output] + recipe.outputAmount },
    professionExperience,
    craftedByRecipe,
    remainingBatches,
    recipeProgressMs: 0,
    reservedInputs: emptyResources(),
    reservedOutput: null,
    pausedReason: remainingBatches === 0 ? 'target-reached' : null,
  };
}

export function advanceOutpost(
  state: OutpostState,
  definition: OutpostDefinition,
  fromMs: number,
  toMs: number,
): OutpostState {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return state;
  let next = state;
  let now = fromMs;
  while (now < toMs) {
    if (next.activeRecipeId !== null && next.reservedOutput === null) {
      next = { ...next, ...startBatch(next, definition) };
    }
    const recipe =
      next.activeRecipeId === null ? undefined : findRecipe(definition, next.activeRecipeId);
    const untilCompletion =
      next.reservedOutput !== null && recipe !== undefined
        ? recipe.durationMs - next.recipeProgressMs
        : SIMULATION_STEP_MS;
    const elapsed = Math.min(SIMULATION_STEP_MS, toMs - now, untilCompletion);
    if (elapsed <= 0) break;
    next = addProduction(next, definition, elapsed);
    if (next.reservedOutput !== null) {
      const recipeProgressMs = next.recipeProgressMs + elapsed;
      next = { ...next, recipeProgressMs };
      if (recipe !== undefined && recipeProgressMs >= recipe.durationMs)
        next = finishBatch(next, definition);
    }
    now += elapsed;
  }
  if (
    next.activeRecipeId !== null &&
    next.reservedOutput === null &&
    next.pausedReason !== 'target-reached'
  ) {
    next = { ...next, ...startBatch(next, definition) };
  }
  return next;
}

export function validateOutpostState(state: OutpostState, definition: OutpostDefinition): void {
  if (Object.keys(state.resources).length !== OUTPOST_RESOURCE_IDS.length)
    throw new Error('Outpost inventory has missing or unknown resources');
  let total = 0;
  for (const id of OUTPOST_RESOURCE_IDS) {
    const amount = state.resources[id];
    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      amount > getOutpostResourceCapacity(state, definition, id)
    )
      throw new Error(`Invalid outpost inventory: ${id}`);
    total += amount;
  }
  if (total > getOutpostStorageCapacity(state, definition))
    throw new Error('Outpost storage capacity exceeded');
  if (
    Object.keys(state.facilities).length !== OUTPOST_FACILITY_IDS.length ||
    Object.keys(state.jobAssignments).length !== OUTPOST_JOB_IDS.length ||
    Object.keys(state.jobTargets).length !== OUTPOST_JOB_IDS.length ||
    Object.keys(state.reviewedProductionByJob).length !== OUTPOST_JOB_IDS.length ||
    Object.keys(state.reviewedCraftedByRecipe).length !== OUTPOST_RECIPE_IDS.length ||
    OUTPOST_JOB_IDS.some(
      (id) =>
        !Object.hasOwn(state.jobAssignments, id) ||
        !Object.hasOwn(state.jobTargets, id) ||
        !Object.hasOwn(state.reviewedProductionByJob, id),
    ) ||
    OUTPOST_FACILITY_IDS.some((id) => !Object.hasOwn(state.facilities, id)) ||
    OUTPOST_RECIPE_IDS.some((id) => !Object.hasOwn(state.reviewedCraftedByRecipe, id)) ||
    OUTPOST_JOB_IDS.reduce((sum, id) => sum + state.jobAssignments[id], 0) !== definition.population
  )
    throw new Error('Outpost workforce allocation does not conserve population');
  for (const id of OUTPOST_JOB_IDS) {
    const target = state.jobTargets[id];
    if (target !== null && (!Number.isSafeInteger(target) || target < 1))
      throw new Error(`Invalid outpost stock target: ${id}`);
    if (!Number.isSafeInteger(state.jobAssignments[id]) || state.jobAssignments[id] < 0)
      throw new Error(`Invalid outpost workforce: ${id}`);
    if (
      !Number.isFinite(state.reviewedProductionByJob[id]) ||
      state.reviewedProductionByJob[id] < 0 ||
      state.reviewedProductionByJob[id] > state.producedByJob[id]
    )
      throw new Error(`Invalid reviewed production ledger: ${id}`);
  }
  for (const id of OUTPOST_PROFESSION_IDS) {
    const amount = state.professionExperience[id];
    if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER)
      throw new Error(`Invalid outpost profession experience: ${id}`);
  }
  if (state.activeRecipeId !== null) {
    const recipe = findRecipe(definition, state.activeRecipeId);
    if (recipe === undefined) throw new Error('Outpost queue references unknown recipe');
    if (
      state.remainingBatches !== null &&
      (!Number.isSafeInteger(state.remainingBatches) || state.remainingBatches < 0)
    )
      throw new Error('Invalid outpost remaining batch target');
    if (
      !Number.isFinite(state.recipeProgressMs) ||
      state.recipeProgressMs < 0 ||
      state.recipeProgressMs >= recipe.durationMs
    )
      throw new Error('Invalid outpost recipe progress');
    if (state.reservedOutput === null && state.recipeProgressMs !== 0)
      throw new Error('Outpost recipe progress has no reserved output');
    if (state.reservedOutput !== null && state.reservedOutput !== recipe.output)
      throw new Error('Outpost reserved output does not match recipe');
    for (const id of OUTPOST_RESOURCE_IDS) {
      const expected = state.reservedOutput === null ? 0 : (recipe.inputs[id] ?? 0);
      if (state.reservedInputs[id] !== expected)
        throw new Error('Outpost reserved inputs do not match the active recipe');
    }
  } else if (
    state.recipeProgressMs !== 0 ||
    state.reservedOutput !== null ||
    state.remainingBatches !== null
  ) {
    throw new Error('Inactive outpost recipe has pending work');
  } else if (OUTPOST_RESOURCE_IDS.some((id) => state.reservedInputs[id] !== 0)) {
    throw new Error('Inactive outpost recipe retains reserved inputs');
  }
  for (const id of OUTPOST_JOB_IDS) {
    if (!Number.isFinite(state.producedByJob[id]) || state.producedByJob[id] < 0)
      throw new Error(`Invalid outpost production ledger: ${id}`);
  }
  for (const recipe of definition.recipes) {
    if (
      !Number.isSafeInteger(state.craftedByRecipe[recipe.id]) ||
      state.craftedByRecipe[recipe.id] < 0
    )
      throw new Error(`Invalid outpost crafting ledger: ${recipe.id}`);
    if (
      !Number.isSafeInteger(state.reviewedCraftedByRecipe[recipe.id]) ||
      state.reviewedCraftedByRecipe[recipe.id] < 0 ||
      state.reviewedCraftedByRecipe[recipe.id] > state.craftedByRecipe[recipe.id]
    )
      throw new Error(`Invalid reviewed crafting ledger: ${recipe.id}`);
  }
  for (const facility of definition.facilities) {
    const count = state.facilities[facility.id];
    if (!Number.isSafeInteger(count) || count < 0 || count > facility.maxCount)
      throw new Error(`Invalid outpost facility count: ${facility.id}`);
  }
}
