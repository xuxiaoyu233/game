import type { SkillLoopErrorCode } from '../domain/skill-loop/types';

/** 规则层错误码 → 面向玩家的提示文案。文案属展示层，不进 domain。 */

export const ACTION_ERRORS: Record<SkillLoopErrorCode, string> = {
  UNKNOWN_ACTIVITY: '找不到这项活动，请重新打开原型。',
  UNKNOWN_UPGRADE: '找不到这项工具提升。',
  LOCKED: '先提升对应技能等级。',
  ACTIVITY_ALREADY_RUNNING: '先暂停或切换当前活动。',
  NO_ACTIVITY_TO_PAUSE: '当前没有正在运行的活动。',
  NO_ACTIVITY_TO_RESUME: '当前没有可恢复的活动。',
  INSUFFICIENT_RESOURCES: '材料不足；现有库存没有被扣除。',
  ALREADY_PURCHASED: '这项工具提升已经完成。',
  NUMERIC_LIMIT: '数值达到安全上限，本次结算未写入；请导出存档保留进度。',
};
