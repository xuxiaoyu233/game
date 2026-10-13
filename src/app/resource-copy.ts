import type { ResourceId, Resources, WorldDefinition } from '../domain/legacy/expedition/types';
import { RESOURCE_COPY } from '../themes/expedition-copy';
import { formatAmount } from './format';

export function getResourceName(world: WorldDefinition | undefined, resource: ResourceId): string {
  const contentId = world?.resourceDefinitions?.find((item) => item.slot === resource)?.id;
  return RESOURCE_COPY[contentId ?? resource]?.name ?? RESOURCE_COPY[resource]?.name ?? resource;
}

export function getResourcePairText(
  resources: Resources,
  world: WorldDefinition | undefined,
): string {
  return `${getResourceName(world, 'wood')} ${formatAmount(resources.wood)} · ${getResourceName(world, 'stone')} ${formatAmount(resources.stone)}`;
}
