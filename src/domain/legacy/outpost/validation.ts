import type { ExpeditionDefinition } from '../expedition/types';
import type { OutpostDefinition, OutpostResourceId } from './types';

const RESOURCE_IDS: readonly OutpostResourceId[] = [
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
function amount(value: number, label: string, positive = false): void {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER ||
    (positive && value === 0)
  )
    throw new RangeError(`Invalid outpost amount: ${label}`);
}

export function validateOutpostDefinition(
  definition: OutpostDefinition,
  expedition: ExpeditionDefinition,
  registerContentId: (id: string, label: string) => void,
): void {
  if (!Number.isSafeInteger(definition.population) || definition.population < 1)
    throw new Error('Outpost population must be a positive safe integer');
  amount(definition.storageCapacity, 'storageCapacity', true);
  for (const resourceId of RESOURCE_IDS) {
    amount(definition.startingResources[resourceId], `startingResources.${resourceId}`);
    amount(definition.resourceCaps[resourceId], `resourceCaps.${resourceId}`, true);
    if (definition.startingResources[resourceId] > definition.resourceCaps[resourceId])
      throw new Error(`Outpost starting stock exceeds cap: ${resourceId}`);
  }
  const startingTotal = RESOURCE_IDS.reduce((sum, id) => sum + definition.startingResources[id], 0);
  if (startingTotal > definition.storageCapacity)
    throw new Error('Outpost starting stock exceeds storage');

  const jobIds = new Set<string>();
  for (const job of definition.jobs) {
    registerContentId(job.id, 'outpost job');
    if (jobIds.has(job.id) || !RESOURCE_IDS.includes(job.output))
      throw new Error(`Invalid outpost job: ${job.id}`);
    jobIds.add(job.id);
    amount(job.amountPerWorkerHour, `${job.id}.amountPerWorkerHour`, true);
    amount(job.experiencePerWorkerHour, `${job.id}.experiencePerWorkerHour`, true);
  }
  if (jobIds.size !== 3) throw new Error('Outpost requires three distinct basic jobs');

  const recipeIds = new Set<string>();
  const clues = new Set(expedition.story.clues.map((clue) => clue.id));
  for (const recipe of definition.recipes) {
    registerContentId(recipe.id, 'outpost recipe');
    if (recipeIds.has(recipe.id) || !RESOURCE_IDS.includes(recipe.output))
      throw new Error(`Invalid outpost recipe: ${recipe.id}`);
    recipeIds.add(recipe.id);
    amount(recipe.outputAmount, `${recipe.id}.outputAmount`, true);
    amount(recipe.durationMs, `${recipe.id}.durationMs`, true);
    amount(recipe.minimumProfessionLevel, `${recipe.id}.minimumProfessionLevel`);
    if (!Number.isSafeInteger(recipe.minimumProfessionLevel))
      throw new Error(`Outpost recipe level must be an integer: ${recipe.id}`);
    if (Object.keys(recipe.inputs).length === 0)
      throw new Error(`Outpost recipe has no inputs: ${recipe.id}`);
    for (const [resourceId, cost] of Object.entries(recipe.inputs)) {
      if (!RESOURCE_IDS.includes(resourceId as OutpostResourceId))
        throw new Error(`Unknown outpost recipe input: ${recipe.id}/${resourceId}`);
      amount(cost ?? 0, `${recipe.id}.inputs.${resourceId}`, true);
    }
    for (const clueId of recipe.requiredClueIds) {
      if (!clues.has(clueId))
        throw new Error(`Outpost recipe references unknown clue: ${recipe.id}/${clueId}`);
    }
  }
  if (recipeIds.size !== 4) throw new Error('Outpost requires four recipes');
  const facilityIds = new Set<string>();
  for (const facility of definition.facilities) {
    registerContentId(facility.id, 'outpost facility');
    if (facilityIds.has(facility.id)) throw new Error(`Duplicate outpost facility: ${facility.id}`);
    facilityIds.add(facility.id);
    if (!Number.isSafeInteger(facility.maxCount) || facility.maxCount < 1)
      throw new Error(`Invalid outpost facility limit: ${facility.id}`);
    amount(facility.storageCapacityBonus, `${facility.id}.storageCapacityBonus`, true);
    amount(facility.resourceCapacityBonus, `${facility.id}.resourceCapacityBonus`, true);
    for (const [resourceId, cost] of Object.entries(facility.cost)) {
      if (!RESOURCE_IDS.includes(resourceId as OutpostResourceId))
        throw new Error(`Unknown outpost facility cost: ${facility.id}/${resourceId}`);
      amount(cost ?? 0, `${facility.id}.cost.${resourceId}`, true);
    }
  }
  if (definition.anchorSupport !== undefined) {
    if (!RESOURCE_IDS.includes(definition.anchorSupport.resourceId))
      throw new Error('Outpost anchor support references an unknown resource');
    amount(definition.anchorSupport.stability, 'anchorSupport.stability', true);
    if (!Number.isSafeInteger(definition.anchorSupport.stability))
      throw new Error('Outpost anchor support must restore an integer amount');
    if (!expedition.worlds.some((world) => world.mode?.kind === 'anchor-city'))
      throw new Error('Outpost anchor support requires an anchor-city world');
  }
  if (
    definition.professionLevelExperience.length === 0 ||
    definition.professionLevelExperience[0] !== 0
  )
    throw new Error('Outpost profession level thresholds must begin at zero');
  let previous = -1;
  for (const threshold of definition.professionLevelExperience) {
    amount(threshold, 'professionLevelExperience');
    if (!Number.isSafeInteger(threshold) || threshold <= previous)
      throw new Error('Outpost profession level thresholds must be strictly increasing integers');
    previous = threshold;
  }
  amount(definition.experiencePerBatch, 'experiencePerBatch', true);
}
