import type { SkillLoopDefinition, SkillLoopState } from '../domain/skill-loop/types';
import { SkillSaveValidationError, validateSkillLoopSave } from './skill-loop-codec';

function unsupported(message: string): never {
  throw new SkillSaveValidationError('UNSUPPORTED_VERSION', message);
}

function sourceRecord(source: unknown): Record<string, unknown> {
  if (source === null || typeof source !== 'object' || Array.isArray(source))
    return unsupported('技能原型存档不是可识别的对象。');
  return source as Record<string, unknown>;
}

function preserveRecord<T extends Readonly<Record<string, number>>>(
  defaults: T,
  previous: Readonly<Record<string, number>>,
  currentIds: ReadonlySet<string>,
  field: string,
): Record<string, number> {
  for (const id of Object.keys(previous)) {
    if (!currentIds.has(id)) unsupported(`旧存档的 ${field} 含有新版本无法解释的 ID：${id}。`);
  }
  return { ...defaults, ...previous };
}

/** Upgrade P1 mechanics and either P1/P2 save shape to the current explicit schema. */
export function migrateSkillPrototypeSave(
  value: unknown,
  previousP1Definition: SkillLoopDefinition,
  definition: SkillLoopDefinition,
): SkillLoopState {
  const source = sourceRecord(value);
  if (definition.profileId !== 'skill-prototype-v1' || definition.schemaVersion !== 2) {
    return unsupported('此迁移只支持 skill-prototype-v1 的当前 schema 2。');
  }

  if (source.profileId !== definition.profileId) {
    return unsupported('存档 profile 或格式版本不兼容，原存档未被覆盖。');
  }

  if (source.contentVersion === '1.0.0' && source.schemaVersion === 1) {
    const previous = validateSkillLoopSave(source, previousP1Definition);
    const itemIds = new Set(definition.items.map((item) => item.id));
    const skillIds = new Set(definition.skills.map((skill) => skill.id));
    const toolIds = new Set(definition.tools.map((tool) => tool.id));
    return {
      ...previous,
      schemaVersion: definition.schemaVersion,
      contentVersion: definition.contentVersion,
      inventory: preserveRecord(definition.initialInventory, previous.inventory, itemIds, '库存'),
      skillXp: preserveRecord(definition.initialSkillXp, previous.skillXp, skillIds, '技能经验'),
      toolLevels: preserveRecord(
        definition.initialToolLevels,
        previous.toolLevels,
        toolIds,
        '工具等级',
      ),
      returnReport: null,
    };
  }

  if (source.contentVersion === definition.contentVersion && source.schemaVersion === 1) {
    const previousDefinition: SkillLoopDefinition = { ...definition, schemaVersion: 1 };
    const previous = validateSkillLoopSave(source, previousDefinition);
    return {
      ...previous,
      schemaVersion: definition.schemaVersion,
      contentVersion: definition.contentVersion,
      returnReport: null,
    };
  }

  return unsupported('此技能原型存档版本没有经过验证的迁移路径，原存档未被覆盖。');
}
