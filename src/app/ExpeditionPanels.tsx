import { useState } from 'react';
import type { BuildingId } from '../domain/legacy/expedition/types';
import type {
  ExpeditionHubTab,
  ExpeditionPanelsProps,
  ExpeditionRunTab,
} from './expedition-panels-types';
import { ExpeditionHubPanels } from './ExpeditionHubPanels';
import { ExpeditionRunPanels } from './ExpeditionRunPanels';

export function ExpeditionPanels(props: ExpeditionPanelsProps) {
  const [activeTab, setActiveTab] = useState<ExpeditionRunTab>('operations');
  const [hubTab, setHubTab] = useState<ExpeditionHubTab>('departure');
  const [selectedContractIds, setSelectedContractIds] = useState<Record<string, string>>({});
  const [constructionTarget, setConstructionTarget] = useState<BuildingId>('shelter');

  if (props.state.activeRun === null) {
    return (
      <ExpeditionHubPanels
        {...props}
        hubTab={hubTab}
        setHubTab={setHubTab}
        selectedContractIds={selectedContractIds}
        setSelectedContractIds={setSelectedContractIds}
      />
    );
  }
  return (
    <ExpeditionRunPanels
      {...props}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      constructionTarget={constructionTarget}
      setConstructionTarget={setConstructionTarget}
    />
  );
}
