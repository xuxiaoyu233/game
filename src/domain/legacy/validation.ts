import type { GameDefinition } from './types';

const CONTENT_ID_PATTERN = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const RESERVED_IDS = new Set(['constructor', 'prototype']);

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid game definition: ${message}`);
}

function validateNumber(value: number, label: string, minimum: number): void {
  assert(
    Number.isFinite(value) && value >= minimum && value <= Number.MAX_SAFE_INTEGER,
    `${label} must be finite and between ${minimum} and Number.MAX_SAFE_INTEGER`,
  );
}

/** Fail early rather than running mechanics with broken references or unlock cycles. */
export function validateGameDefinition(definition: GameDefinition): void {
  assert(
    typeof definition.contentVersion === 'string' && definition.contentVersion.trim().length > 0,
    'contentVersion must be a nonempty string',
  );
  const allIds = new Set<string>();
  function addId(id: string, label: string): void {
    assert(
      typeof id === 'string' && CONTENT_ID_PATTERN.test(id) && !RESERVED_IDS.has(id),
      `${label} must be a stable English identifier`,
    );
    assert(!allIds.has(id), `${label} duplicates ${id}`);
    allIds.add(id);
  }
  addId(definition.worldId, 'worldId');
  validateNumber(definition.initialClickYield, 'initialClickYield', Number.MIN_VALUE);
  validateNumber(definition.maxOfflineMs, 'maxOfflineMs', Number.MIN_VALUE);

  const tools = new Set(definition.tools.map((tool) => tool.id));
  const tasks = new Set(definition.tasks.map((task) => task.id));
  const prerequisites = new Map<string, string[]>();

  function validateTaskReference(taskId: string | undefined, label: string): void {
    if (taskId !== undefined) assert(tasks.has(taskId), `${label} references an unknown task`);
  }
  function validateRequiredTool(
    requirement: { readonly toolId: string; readonly count: number },
    label: string,
  ): void {
    assert(tools.has(requirement.toolId), `${label} references an unknown tool`);
    assert(
      Number.isSafeInteger(requirement.count) && requirement.count > 0,
      `${label} count must be a positive safe integer`,
    );
  }

  for (const tool of definition.tools) {
    addId(tool.id, 'tool id');
    validateNumber(tool.baseCost, `${tool.id}.baseCost`, Number.MIN_VALUE);
    validateNumber(tool.costGrowth, `${tool.id}.costGrowth`, 1);
    validateNumber(tool.productionRate, `${tool.id}.productionRate`, 0);
    validateTaskReference(tool.unlockedByTaskId, `${tool.id}.unlockedByTaskId`);
    prerequisites.set(tool.id, tool.unlockedByTaskId === undefined ? [] : [tool.unlockedByTaskId]);
  }
  for (const upgrade of definition.upgrades) {
    addId(upgrade.id, 'upgrade id');
    validateNumber(upgrade.cost, `${upgrade.id}.cost`, Number.MIN_VALUE);
    validateNumber(upgrade.effect.multiplier, `${upgrade.id}.multiplier`, Number.MIN_VALUE);
    assert(
      upgrade.effect.kind === 'click-multiplier' || upgrade.effect.kind === 'tool-multiplier',
      `${upgrade.id} has an unknown effect kind`,
    );
    if (upgrade.effect.kind === 'tool-multiplier') {
      assert(tools.has(upgrade.effect.toolId), `${upgrade.id} effect references an unknown tool`);
    }
    validateTaskReference(upgrade.unlockedByTaskId, `${upgrade.id}.unlockedByTaskId`);
    if (upgrade.requiredTool !== undefined) validateRequiredTool(upgrade.requiredTool, upgrade.id);
  }
  for (const task of definition.tasks) {
    addId(task.id, 'task id');
    validateTaskReference(task.previousTaskId, `${task.id}.previousTaskId`);
    validateNumber(task.totalGathered, `${task.id}.totalGathered`, 0);
    validateNumber(task.reward, `${task.id}.reward`, 0);
    validateRequiredTool(task.requiredTool, task.id);
    const dependencies = [task.requiredTool.toolId];
    if (task.previousTaskId !== undefined) dependencies.push(task.previousTaskId);
    prerequisites.set(task.id, dependencies);
  }
  for (const event of definition.events) {
    addId(event.id, 'event id');
    validateTaskReference(event.triggeredByTaskId, `${event.id}.triggeredByTaskId`);
    assert(typeof event.triggeredByTaskId === 'string', `${event.id} requires a trigger task`);
    assert(event.options.length > 0, `${event.id} requires at least one option`);
    for (const option of event.options) {
      addId(option.id, 'event option id');
      if (option.effect.kind === 'resource-grant') {
        validateNumber(option.effect.amount, `${option.id}.amount`, 0);
      } else {
        assert(
          option.effect.kind === 'production-multiplier',
          `${option.id} has an unknown effect kind`,
        );
        validateNumber(option.effect.multiplier, `${option.id}.multiplier`, Number.MIN_VALUE);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): void {
    assert(!visiting.has(id), `prerequisite cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisite of prerequisites.get(id) ?? []) visit(prerequisite);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of prerequisites.keys()) visit(id);
}
