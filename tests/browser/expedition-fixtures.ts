import { EXPEDITION_DEFINITION } from '../../src/content/expedition';
import { createExpedition, getExpeditionSummary } from '../../src/domain/expedition/engine';
import {
  advanceAfterResolvingEvents,
  commandAfterResolvingEvents,
} from '../support/expedition-test-events';
import type {
  BuildingId,
  ExpeditionCommand,
  Resources,
  SaveBundle,
} from '../../src/domain/expedition/types';

export const FIXTURE_TIME = Date.UTC(2026, 9, 3, 8);

/** Every fixture uses the same legal commands and preparation boundaries as the UI. */
class ExpeditionFixture {
  state = createExpedition(EXPEDITION_DEFINITION, FIXTURE_TIME);

  command(command: ExpeditionCommand): void {
    const transition = this.state.activeRun?.workerTransition;
    if (transition !== null && transition !== undefined) this.advance(transition.remainingMs);
    this.state = commandAfterResolvingEvents(this.state, EXPEDITION_DEFINITION, command);
  }

  advance(milliseconds: number): void {
    this.state = advanceAfterResolvingEvents(
      this.state,
      EXPEDITION_DEFINITION,
      this.state.lastSimulatedAt + milliseconds,
    );
  }

  gatherUntil(resources: Resources): void {
    for (const resource of ['wood', 'stone'] as const) {
      let attempts = 0;
      while ((this.state.activeRun?.resources[resource] ?? 0) < resources[resource]) {
        const run = this.state.activeRun;
        if (run === null || attempts++ > 200) {
          throw new Error(
            `Fixture cannot gather enough ${resource} before the preparation boundary`,
          );
        }
        if (run.phase === 'awaiting-wave') {
          this.fightNextWave();
          continue;
        }
        if (run.phase !== 'preparing') {
          throw new Error(
            `Fixture cannot gather enough ${resource} before the preparation boundary`,
          );
        }
        this.advance(Math.max(0, run.gatherAvailableAt - this.state.lastSimulatedAt));
        this.command({ kind: 'gather', resource });
      }
    }
  }

  build(buildingId: BuildingId): void {
    this.gatherUntil(
      getExpeditionSummary(this.state, EXPEDITION_DEFINITION).buildingCosts[buildingId],
    );
    this.command({ kind: 'build', buildingId });
  }

  fightNextWave(): void {
    const run = this.state.activeRun;
    if (run === null) throw new Error('Fixture has no active run');
    const world = EXPEDITION_DEFINITION.worlds.find((candidate) => candidate.id === run.worldId);
    if (
      world === undefined ||
      world.mode?.kind === 'snow-observatory' ||
      world.preparationMs === undefined
    )
      throw new Error('Fixture has no wave-survival world');
    const preparation = world.preparationMs[run.clearedWaves];
    if (preparation === undefined) throw new Error('Fixture has no next wave');
    this.advance(preparation - run.elapsedInStageMs);
    this.command({ kind: 'fight-wave' });
  }

  startBasicRun(worldId = 'forest'): void {
    this.command({ kind: 'enter-world', worldId });
    this.build('shelter');
    this.build('wall');
    this.fightNextWave();
  }

  finishBasicRun(worldId = 'forest'): void {
    this.startBasicRun(worldId);
    this.fightNextWave();
    this.command({ kind: 'return' });
  }
}

/** One completed legal journey supplies 20 points; the UI earns the second reward. */
export function oneCompletedJourney(): SaveBundle {
  const fixture = new ExpeditionFixture();
  fixture.finishBasicRun();
  return fixture.state;
}

/** Three fixed successful returns provide the shared points budget for the preparation tree. */
export function threeCompletedJourneys(): SaveBundle {
  const fixture = new ExpeditionFixture();
  fixture.finishBasicRun();
  fixture.finishBasicRun();
  fixture.finishBasicRun();
  return fixture.state;
}

/** Owns all three research tools and has enough permanent points to test equipment changes. */
export function allPreparationsReady(): SaveBundle {
  const fixture = new ExpeditionFixture();
  fixture.finishBasicRun();
  fixture.finishBasicRun();
  fixture.finishBasicRun();
  for (const researchNodeId of ['production-budget', 'battle-bracing', 'evidence-ledger'] as const)
    fixture.command({ kind: 'research-node', researchNodeId });
  return fixture.state;
}

/** Active evidence-preparation run at the legal post-beacon investigation point. */
export function investigationPreparationReady(): SaveBundle {
  const fixture = new ExpeditionFixture();
  fixture.finishBasicRun();
  fixture.finishBasicRun();
  fixture.finishBasicRun();
  fixture.command({ kind: 'research-node', researchNodeId: 'evidence-ledger' });
  fixture.command({ kind: 'equip-preparation', researchNodeId: 'evidence-ledger' });
  fixture.command({ kind: 'enter-world', worldId: 'forest' });
  fixture.gatherUntil({ wood: 38, stone: 23 });
  fixture.build('shelter');
  fixture.fightNextWave();
  fixture.command({ kind: 'choose-beacon', optionId: 'restore' });
  return fixture.state;
}

/** Ready for the UI to build a monument, repair the beacon, and choose the final risk. */
export function optionalChallengeReady(): SaveBundle {
  const fixture = new ExpeditionFixture();
  fixture.command({ kind: 'enter-world', worldId: 'forest' });
  fixture.command({ kind: 'choose-stance', stanceId: 'fortified' });
  fixture.build('shelter');
  fixture.fightNextWave();
  fixture.command({ kind: 'set-workers', presetId: 'mining' });
  fixture.build('lumber-camp');
  fixture.build('quarry');
  fixture.advance(120_000);
  fixture.build('tower');
  fixture.build('tower');
  fixture.build('wall');
  fixture.command({ kind: 'set-workers', presetId: 'balanced' });
  fixture.fightNextWave();
  const world = EXPEDITION_DEFINITION.worlds.find((candidate) => candidate.id === 'forest');
  const monument = world?.buildings.find((building) => building.id === 'monument');
  if (monument === undefined) throw new Error('Fixture has no monument definition');
  fixture.gatherUntil({
    wood: monument.cost.wood + EXPEDITION_DEFINITION.beaconRestoreCost.wood,
    stone: monument.cost.stone + EXPEDITION_DEFINITION.beaconRestoreCost.stone,
  });
  return fixture.state;
}

/** Two rewards buy reinforced core; the next undefended run can fail without losing it. */
export function ownedPerkAndVulnerableRun(): SaveBundle {
  const fixture = new ExpeditionFixture();
  fixture.finishBasicRun();
  fixture.finishBasicRun();
  fixture.command({ kind: 'buy-perk', perkId: 'reinforced-core' });
  fixture.command({ kind: 'enter-world', worldId: 'forest' });
  fixture.fightNextWave();
  fixture.fightNextWave();
  return fixture.state;
}

/** Completed basic contract with low health and a lethal optional third-wave early attack. */
export function returnAnchorReady(): SaveBundle {
  const fixture = new ExpeditionFixture();
  fixture.command({ kind: 'enter-world', worldId: 'forest' });
  fixture.advance(120_000);
  fixture.build('shelter');
  fixture.command({ kind: 'fight-early' });
  fixture.advance(120_000);
  fixture.command({ kind: 'fight-early' });
  return fixture.state;
}

/** Main clues and route permission are earned by returning from both actual worlds. */
export function mainStoryReady(): SaveBundle {
  const fixture = new ExpeditionFixture();
  fixture.finishBasicRun();
  fixture.command({
    kind: 'choose-dialogue',
    dialogueId: 'keeper-debrief',
    optionId: 'trace-source',
  });
  fixture.finishBasicRun('ruins');
  return fixture.state;
}

/** Unlocks the snow observatory through the first two completed worlds and story choice. */
export function snowObservatoryReady(): SaveBundle {
  const fixture = new ExpeditionFixture();
  fixture.finishBasicRun();
  fixture.command({
    kind: 'choose-dialogue',
    dialogueId: 'keeper-debrief',
    optionId: 'trace-source',
  });
  fixture.finishBasicRun('ruins');
  fixture.command({
    kind: 'choose-dialogue',
    dialogueId: 'keeper-revelation',
    optionId: 'follow-coordinate',
  });
  return fixture.state;
}

/** A repeat forest return after the permanent first-return choice is already recorded. */
export function repeatForestReturn(): SaveBundle {
  const fixture = new ExpeditionFixture();
  fixture.finishBasicRun();
  fixture.command({
    kind: 'choose-dialogue',
    dialogueId: 'keeper-debrief',
    optionId: 'trace-source',
  });
  fixture.finishBasicRun('ruins');
  fixture.command({
    kind: 'choose-dialogue',
    dialogueId: 'keeper-revelation',
    optionId: 'follow-coordinate',
  });
  fixture.finishBasicRun('forest');
  return fixture.state;
}

/** A returned river survey plus the keeper's permanent choice opens its selected ruins contract. */
function riverForkState(
  optionId?: 'follow-river-coordinate' | 'protect-evacuation-route',
): ExpeditionFixture {
  const fixture = new ExpeditionFixture();
  fixture.finishBasicRun();
  fixture.command({
    kind: 'choose-dialogue',
    dialogueId: 'keeper-debrief',
    optionId: 'trace-source',
  });
  fixture.finishBasicRun('ruins');
  fixture.command({
    kind: 'choose-dialogue',
    dialogueId: 'keeper-revelation',
    optionId: 'follow-coordinate',
  });
  fixture.command({
    kind: 'enter-world',
    worldId: 'forest',
    contractId: 'forest-survey-contract',
  });
  fixture.build('shelter');
  fixture.fightNextWave();
  fixture.command({
    kind: 'choose-event',
    eventId: 'river-bridge',
    optionId: 'repair-crossing',
  });
  fixture.gatherUntil({ wood: 4, stone: 4 });
  fixture.command({
    kind: 'start-project',
    projectId: 'river-survey',
    workerRole: 'guard',
  });
  fixture.advance(45_000);
  fixture.fightNextWave();
  fixture.command({ kind: 'return' });
  if (optionId !== undefined)
    fixture.command({ kind: 'choose-dialogue', dialogueId: 'keeper-river-review', optionId });
  return fixture;
}

export function riverForkDecisionReady(): SaveBundle {
  return riverForkState().state;
}

export function riverForkReady(
  optionId: 'follow-river-coordinate' | 'protect-evacuation-route',
): SaveBundle {
  return riverForkState(optionId).state;
}

/** The selected branch's objective is returned, unlocking the alternate contract for replay. */
export function riverForkAfterBranchReturn(
  optionId: 'follow-river-coordinate' | 'protect-evacuation-route',
): SaveBundle {
  const fixture = riverForkState(optionId);
  const contractId =
    optionId === 'follow-river-coordinate' ? 'ruins-observatory-contract' : 'ruins-relief-contract';
  fixture.command({ kind: 'enter-world', worldId: 'ruins', contractId });
  fixture.command({ kind: 'set-workers', presetId: 'guard' });
  fixture.command({ kind: 'choose-stance', stanceId: 'fortified' });
  fixture.build('shelter');
  fixture.fightNextWave();
  if (optionId === 'follow-river-coordinate') {
    fixture.build('tower');
    fixture.build('wall');
    fixture.fightNextWave();
    fixture.build('wall');
    fixture.fightNextWave();
  } else {
    fixture.build('lumber-camp');
    fixture.build('wall');
    fixture.fightNextWave();
    fixture.build('wall');
  }
  fixture.command({ kind: 'return' });
  return fixture.state;
}
