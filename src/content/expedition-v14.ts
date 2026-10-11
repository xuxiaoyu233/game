import type { ExpeditionDefinition } from '../domain/expedition/types';
import { EXPEDITION_V13_DEFINITION } from './expedition-v13';
import { OUTPOST_V14_DEFINITION } from './outpost-v14';

/** v14 adds the first persistent home economy while freezing v13 for explicit migration. */
export const EXPEDITION_V14_DEFINITION: ExpeditionDefinition = {
  ...EXPEDITION_V13_DEFINITION,
  contentVersion: '14.0.0',
  outpost: OUTPOST_V14_DEFINITION,
};
