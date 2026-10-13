import type { ExpeditionDefinition } from '../../domain/legacy/expedition/types';

export type StoryArchiveReferenceKind = 'clue' | 'world' | 'dialogue' | 'theme-copy';

export interface StoryArchiveReference {
  readonly kind: StoryArchiveReferenceKind;
  readonly id: string;
}

export interface StoryArchiveRecord {
  readonly id: string;
  readonly lifecycle: 'approved';
  readonly visibility: 'player-evidence';
  readonly gameRefs: readonly StoryArchiveReference[];
}

export interface StoryArchiveUiEntry {
  readonly clueId: string;
  readonly copyId: string;
}

function archiveClue(id: string, origin: StoryArchiveReference): StoryArchiveRecord {
  return {
    id,
    lifecycle: 'approved',
    visibility: 'player-evidence',
    gameRefs: [{ kind: 'clue', id }, { kind: 'theme-copy', id }, origin],
  };
}

/** Reviewed projection for the existing player-facing story archive. */
export const STORY_ARCHIVE_PROJECTION: readonly StoryArchiveRecord[] = [
  archiveClue('snow-observatory-record', { kind: 'world', id: 'snow-observatory' }),
  archiveClue('forest-signal', { kind: 'world', id: 'forest' }),
  archiveClue('ruins-record', { kind: 'world', id: 'ruins' }),
  archiveClue('forest-inscription', { kind: 'world', id: 'forest' }),
  archiveClue('ruins-script', { kind: 'world', id: 'ruins' }),
  archiveClue('forest-river-record', { kind: 'world', id: 'forest' }),
  archiveClue('forest-perimeter-record', { kind: 'world', id: 'forest' }),
  archiveClue('forest-relay-record', { kind: 'world', id: 'forest' }),
  archiveClue('ruins-observatory-record', { kind: 'world', id: 'ruins' }),
  archiveClue('ruins-relief-manifest', { kind: 'world', id: 'ruins' }),
  archiveClue('route-source', { kind: 'dialogue', id: 'keeper-debrief' }),
  archiveClue('route-rescue', { kind: 'dialogue', id: 'keeper-debrief' }),
  archiveClue('door-coordinate', { kind: 'dialogue', id: 'keeper-revelation' }),
  archiveClue('time-loop-proof', { kind: 'dialogue', id: 'keeper-sideproof' }),
  archiveClue('river-coordinate', { kind: 'dialogue', id: 'keeper-river-review' }),
  archiveClue('relief-route', { kind: 'dialogue', id: 'keeper-river-review' }),
  archiveClue('snow-order', { kind: 'dialogue', id: 'keeper-snow-debrief' }),
];

/** Reviewed projection for the approved v13 first-world story slice. */
export const STORY_ARCHIVE_V13_PROJECTION: readonly StoryArchiveRecord[] = [
  archiveClue('clue-unlisted-rescue-receipt', { kind: 'world', id: 'world-unlisted-city' }),
  archiveClue('clue-household-lamp-record', { kind: 'world', id: 'world-unlisted-city' }),
  archiveClue('clue-missing-household-page', { kind: 'world', id: 'world-unlisted-city' }),
  archiveClue('clue-impossible-return-time', { kind: 'dialogue', id: 'dialogue-return-audit' }),
];

export function validateStoryArchiveProjection(
  definition: Pick<ExpeditionDefinition, 'story' | 'worlds'>,
  projection: readonly StoryArchiveRecord[],
  copyIds: readonly string[],
): readonly StoryArchiveUiEntry[] {
  const clues = new Map(definition.story.clues.map((clue) => [clue.id, clue]));
  const worlds = new Set(definition.worlds.map((world) => world.id));
  const dialogues = new Map(definition.story.dialogues.map((dialogue) => [dialogue.id, dialogue]));
  const records = new Map<string, StoryArchiveRecord>();

  for (const record of projection) {
    if (records.has(record.id)) throw new Error(`Duplicate story archive record: ${record.id}`);
    records.set(record.id, record);

    const clueReferences = record.gameRefs.filter((reference) => reference.kind === 'clue');
    const copyReferences = record.gameRefs.filter((reference) => reference.kind === 'theme-copy');
    const worldReferences = record.gameRefs.filter((reference) => reference.kind === 'world');
    const dialogueReferences = record.gameRefs.filter((reference) => reference.kind === 'dialogue');
    const clue = clues.get(record.id);

    if (clue === undefined) throw new Error(`Story archive references unknown clue: ${record.id}`);
    if (clueReferences.length !== 1 || clueReferences[0]?.id !== record.id)
      throw new Error(`Story archive clue reference does not match record: ${record.id}`);
    if (
      copyReferences.length !== 1 ||
      copyReferences[0]?.id === undefined ||
      !copyIds.includes(copyReferences[0].id)
    )
      throw new Error(`Story archive references missing theme copy: ${record.id}`);

    if (clue.source === 'dialogue') {
      if (worldReferences.length !== 0 || dialogueReferences.length !== 1)
        throw new Error(`Dialogue clue must reference one dialogue only: ${record.id}`);
      const dialogue = dialogues.get(dialogueReferences[0]?.id ?? '');
      if (
        dialogue === undefined ||
        !dialogue.options.some((option) => option.grantsClueId === clue.id)
      )
        throw new Error(`Story archive dialogue does not grant clue: ${record.id}`);
    } else {
      if (dialogueReferences.length !== 0 || worldReferences.length !== 1)
        throw new Error(`World clue must reference one world only: ${record.id}`);
      if (clue.worldId === null || worldReferences[0]?.id !== clue.worldId)
        throw new Error(`Story archive world does not match clue source: ${record.id}`);
      if (!worlds.has(worldReferences[0].id))
        throw new Error(`Story archive references unknown world: ${record.id}`);
    }
  }

  for (const clueId of clues.keys()) {
    if (!records.has(clueId))
      throw new Error(`Story clue is missing from archive projection: ${clueId}`);
  }

  return projection.map((record) => {
    const clueReference = record.gameRefs.find((reference) => reference.kind === 'clue');
    const copyReference = record.gameRefs.find((reference) => reference.kind === 'theme-copy');
    if (clueReference === undefined || copyReference === undefined)
      throw new Error(`Story archive record is missing a UI reference: ${record.id}`);
    return { clueId: clueReference.id, copyId: copyReference.id };
  });
}
