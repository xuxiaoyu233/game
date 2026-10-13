import { useState } from 'react';
import type {
  DifficultyModifierId,
  ExpeditionCommand,
  ExpeditionDefinition,
  WorldDefinition,
} from '../../domain/legacy/expedition/types';
import { DIFFICULTY_MODIFIER_COPY } from '../../themes/legacy/expedition-copy';

interface DifficultyModifierSelectorProps {
  readonly definition: ExpeditionDefinition;
  readonly world: WorldDefinition;
  readonly selectedModifierIds: readonly DifficultyModifierId[];
  readonly disabled: boolean;
  readonly onCommand: (command: ExpeditionCommand) => void;
}

export function DifficultyModifierSelector({
  definition,
  world,
  selectedModifierIds,
  disabled,
  onCommand,
}: DifficultyModifierSelectorProps) {
  const [expanded, setExpanded] = useState(selectedModifierIds.length > 0);
  const mode = world.mode?.kind ?? 'wave-survival';
  const applicableModifiers = (definition.difficultyModifiers ?? []).filter((modifier) =>
    modifier.appliesToModes.includes(mode),
  );
  const difficulty = applicableModifiers
    .filter((modifier) => selectedModifierIds.includes(modifier.id))
    .reduce((total, modifier) => total + modifier.difficulty, 0);
  const reward =
    definition.difficultyRewardTiers?.find(
      (tier) =>
        difficulty >= tier.minimumDifficulty &&
        (tier.maximumDifficulty === null || difficulty <= tier.maximumDifficulty),
    )?.points ?? 0;

  const update = (modifierId: DifficultyModifierId, enabled: boolean) => {
    const next = enabled
      ? [...selectedModifierIds, modifierId]
      : selectedModifierIds.filter((id) => id !== modifierId);
    onCommand({ kind: 'select-difficulty-modifiers', worldId: world.id, modifierIds: next });
  };

  return (
    <details
      className="difficulty-selector"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        附加挑战 · 难度 {difficulty} · 基础契约额外 +{reward} 界点
      </summary>
      <fieldset disabled={disabled}>
        <legend>可组合条款</legend>
        {definition.difficultyModifiers?.map((modifier) => {
          const applicable = modifier.appliesToModes.includes(mode);
          const copy = DIFFICULTY_MODIFIER_COPY[modifier.id];
          return (
            <label className="difficulty-option" key={modifier.id}>
              <input
                type="checkbox"
                checked={selectedModifierIds.includes(modifier.id)}
                disabled={!applicable || disabled}
                onChange={(event) => update(modifier.id, event.currentTarget.checked)}
              />
              <span>
                <strong>
                  {copy?.name ?? modifier.id} · 难度 +{modifier.difficulty}
                </strong>
                <small>
                  {copy?.description ?? '额外挑战条款。'}
                  {applicable ? '' : ' · 不适用于当前世界'}
                </small>
              </span>
            </label>
          );
        })}
      </fieldset>
      <small>条款可自由组合；奖励按总难度分档，只在成功完成基础契约后结算。</small>
    </details>
  );
}
