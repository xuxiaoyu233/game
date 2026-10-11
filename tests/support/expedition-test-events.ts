import {
  advanceExpedition,
  applyExpeditionCommand,
  getExpeditionSummary,
} from '../../src/domain/expedition/engine';
import type {
  ExpeditionDefinition,
  ExpeditionCommand,
  SaveBundle,
} from '../../src/domain/expedition/types';

export function resolvePendingEvents(
  state: SaveBundle,
  definition: ExpeditionDefinition,
): SaveBundle {
  let current = state;
  for (let index = 0; index < 16; index += 1) {
    const event = getExpeditionSummary(current, definition).pendingEvents.find(
      (candidate) => candidate.randomPool === 'incident',
    );
    if (event === undefined) return current;
    const run = current.activeRun;
    if (run === null) throw new Error('A pending event requires an active run');
    const option =
      event.options.find(
        (candidate) =>
          candidate.cost.wood === 0 &&
          candidate.cost.stone === 0 &&
          candidate.resourceReward === undefined &&
          candidate.unlockProjectIds.length === 0,
      ) ??
      event.options.find(
        (candidate) =>
          run.resources.wood >= candidate.cost.wood && run.resources.stone >= candidate.cost.stone,
      );
    if (option === undefined) throw new Error(`No affordable test choice for event ${event.id}`);
    const result = applyExpeditionCommand(current, definition, {
      kind: 'choose-event',
      eventId: event.id,
      optionId: option.id,
    });
    if (!result.ok) throw new Error(`event ${event.id}: ${result.error}`);
    current = result.state;
  }
  throw new Error('Too many pending events in a test fixture');
}

export function advanceAfterResolvingEvents(
  state: SaveBundle,
  definition: ExpeditionDefinition,
  now: number,
): SaveBundle {
  return advanceExpedition(resolvePendingEvents(state, definition), definition, now);
}

export function commandAfterResolvingEvents(
  state: SaveBundle,
  definition: ExpeditionDefinition,
  command: ExpeditionCommand,
): SaveBundle {
  const requestedEventId = command.kind === 'choose-event' ? command.eventId : null;
  const pendingIncidents = getExpeditionSummary(state, definition).pendingEvents.filter(
    (event) => event.randomPool === 'incident' && event.id !== requestedEventId,
  );
  const mustResolveIncident = command.kind === 'choose-event' && pendingIncidents.length > 0;
  const shouldResolve =
    mustResolveIncident ||
    (command.kind !== 'choose-event' && command.kind !== 'abandon' && command.kind !== 'tick');
  const current = shouldResolve ? resolvePendingEvents(state, definition) : state;
  const result = applyExpeditionCommand(current, definition, command);
  if (!result.ok) throw new Error(`${command.kind}: ${result.error}`);
  return result.state;
}
