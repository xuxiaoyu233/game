import type {
  ExpeditionDefinition,
  ExpeditionProjectDefinition,
  ResearchNodeDefinition,
  Resources,
  SaveBundle,
  WorldVariantDefinition,
} from '../domain/legacy/expedition/types';
import { OBJECTIVE_COPY, PROJECT_COPY, REWARD_COPY } from '../themes/expedition-copy';
import {
  SETTLEMENT_STORY_COPY,
  STORY_CHAPTERS,
  STORY_SIDE_STORIES,
} from '../themes/story-copy-v13';
import { getResourcePairText } from './resource-copy';

export function costText(
  resources: Resources,
  world: ExpeditionDefinition['worlds'][number] | undefined,
): string {
  return getResourcePairText(resources, world);
}

export function affordable(resources: Resources, cost: Resources): boolean {
  return resources.wood >= cost.wood && resources.stone >= cost.stone;
}

export function selectedVariant(
  state: SaveBundle,
  definition: ExpeditionDefinition,
  worldId: string,
): WorldVariantDefinition | undefined {
  const selectedId = state.profile.selectedVariantIds[worldId];
  return definition.worldVariants?.find(
    (variant) => variant.id === selectedId && variant.worldId === worldId,
  );
}

export function researchEffectText(
  node: ResearchNodeDefinition,
  world: ExpeditionDefinition['worlds'][number] | undefined,
): string {
  switch (node.effect.kind) {
    case 'production-building-discount':
      return `本局首座生产设施减免${getResourcePairText(node.effect.amount, world)}`;
    case 'brace-next-wave':
      return `待迎战阶段可启用一次，下一波防御 +${node.effect.damageReduction}`;
    case 'investigation-cost-discount':
      return `本局首次调查减免${getResourcePairText(node.effect.amount, world)}`;
  }
}

export function rewardName(id: string): string {
  if (id.startsWith('objective:')) {
    const objectiveId = id.slice('objective:'.length);
    return OBJECTIVE_COPY[objectiveId]?.name ?? '可选目标奖励';
  }
  return REWARD_COPY[id] ?? '旅程奖励';
}

export function projectDescription(project: ExpeditionProjectDefinition): string {
  const description = PROJECT_COPY[project.id]?.description ?? '队员正在推进临时项目。';
  return description.replace('{duration}', `${Math.ceil(project.durationMs / 1000)} 秒`);
}

export function storyThreadLabel(
  definition: ExpeditionDefinition,
  storyThreadId: string | undefined,
): string {
  const thread = definition.story.storyThreads?.find((item) => item.id === storyThreadId);
  if (thread === undefined) return '阶段异动';
  const copy =
    thread.kind === 'chapter'
      ? STORY_CHAPTERS.find((item) => item.id === thread.id)
      : STORY_SIDE_STORIES.find((item) => item.id === thread.id);
  return `${thread.kind === 'chapter' ? '章节事件' : '支线异动'} · ${copy?.title ?? thread.id}`;
}

export function settlementStoryResponse(state: SaveBundle) {
  const settlement = state.lastSettlement;
  if (settlement === null) return null;
  if (settlement.outcome === 'failed') return SETTLEMENT_STORY_COPY.failed;
  if (settlement.outcome === 'abandoned') return SETTLEMENT_STORY_COPY.abandoned;
  if (settlement.outcome === 'secured') return SETTLEMENT_STORY_COPY.secured;

  const choices = state.profile.dialogueChoices;
  if (settlement.worldId === 'world-unlisted-city') {
    return Object.hasOwn(choices, 'dialogue-return-audit')
      ? SETTLEMENT_STORY_COPY.worldAfterAudit
      : SETTLEMENT_STORY_COPY.worldAfterReturn;
  }
  if (settlement.worldId === 'forest') {
    if (Object.hasOwn(choices, 'keeper-river-review')) {
      return SETTLEMENT_STORY_COPY.forestAfterRiverChoice;
    }
    if (Object.hasOwn(choices, 'keeper-debrief')) {
      return SETTLEMENT_STORY_COPY.forestAfterRoute;
    }
  }
  if (settlement.worldId === 'ruins' && Object.hasOwn(choices, 'keeper-revelation')) {
    return SETTLEMENT_STORY_COPY.ruinsAfterRevelation;
  }
  return null;
}
