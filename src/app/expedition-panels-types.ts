import type { Dispatch, SetStateAction } from 'react';
import type {
  BuildingId,
  ExpeditionCommand,
  ExpeditionDefinition,
  ExpeditionSummary,
  SaveBundle,
} from '../domain/expedition/types';
import type { StoryArchiveUiEntry } from './story-archive-types';

export interface ExpeditionPanelsProps {
  readonly definition: ExpeditionDefinition;
  readonly state: SaveBundle;
  readonly summary: ExpeditionSummary;
  readonly busy: boolean;
  readonly onCommand: (command: ExpeditionCommand) => void;
  readonly storyArchiveEntries: readonly StoryArchiveUiEntry[];
}

export type ExpeditionHubTab = 'departure' | 'growth' | 'archive';
export type ExpeditionRunTab = 'operations' | 'tasks' | 'analysis' | 'outpost';

export interface ExpeditionHubPanelsProps extends ExpeditionPanelsProps {
  readonly hubTab: ExpeditionHubTab;
  readonly setHubTab: Dispatch<SetStateAction<ExpeditionHubTab>>;
  readonly selectedContractIds: Readonly<Record<string, string>>;
  readonly setSelectedContractIds: Dispatch<SetStateAction<Record<string, string>>>;
}

export interface ExpeditionRunPanelsProps extends ExpeditionPanelsProps {
  readonly activeTab: ExpeditionRunTab;
  readonly setActiveTab: Dispatch<SetStateAction<ExpeditionRunTab>>;
  readonly constructionTarget: BuildingId;
  readonly setConstructionTarget: Dispatch<SetStateAction<BuildingId>>;
}
