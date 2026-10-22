import type { SkillLoopDefinition, SkillLoopId } from '../domain/skill-loop/types';

export interface SkillLoopTheme {
  readonly id: 'skill-prototype-v1';
  readonly title: string;
  readonly uiCopy: {
    readonly productKicker: string;
    readonly startKicker: string;
    readonly startHeading: string;
    readonly startDescription: string;
    readonly startActionPrefix: string;
    readonly nextStepHeading: string;
    readonly nextUnlockPrefix: string;
    readonly availableUpgradePrefix: string;
    readonly replenishPrefix: string;
    readonly noDirectGather: string;
    readonly switchToActivityPrefix: string;
    readonly cycleDiscardWarning: string;
    readonly returnUnlockedPrefix: string;
    readonly returnCurrentGoal: string;
    readonly allContentAvailable: string;
    readonly consumeAction: string;
    readonly buffHeading: string;
    readonly buffDescription: string;
    readonly fuelHeading: string;
    readonly fuelDescription: string;
    readonly shopHeading: string;
    readonly shopDescription: string;
    readonly shopBuyPrefix: string;
    readonly shopCoinLabel: string;
    readonly sellHeading: string;
    readonly sellDescription: string;
    readonly sellActionPrefix: string;
    readonly masteryHeading: string;
    readonly masteryPoolLabel: string;
    readonly masterySpendAction: string;
    readonly masteryCheckpointActive: string;
    readonly masteryCheckpointLocked: string;
    readonly masteryCheckpointSpent: string;
  };
  readonly colors: {
    readonly background: string;
    readonly surface: string;
    readonly surfaceRaised: string;
    readonly text: string;
    readonly muted: string;
    readonly accent: string;
    readonly accentSoft: string;
    readonly border: string;
  };
  readonly skillCopy: Readonly<
    Record<SkillLoopId, { readonly label: string; readonly description: string }>
  >;
  readonly categoryCopy: Readonly<Record<SkillLoopId, { readonly label: string }>>;
  readonly itemCopy: Readonly<Record<SkillLoopId, { readonly label: string }>>;
  readonly activityCopy: Readonly<
    Record<SkillLoopId, { readonly label: string; readonly description: string }>
  >;
  readonly recipeCopy: Readonly<Record<SkillLoopId, { readonly label: string }>>;
  readonly toolCopy: Readonly<
    Record<SkillLoopId, { readonly label: string; readonly effect: string }>
  >;
}

export const SKILL_PROTOTYPE_V1_THEME: SkillLoopTheme = {
  id: 'skill-prototype-v1',
  title: '技能工坊原型',
  uiCopy: {
    productKicker: '本地技能放置',
    startKicker: '从零开始',
    startHeading: '先采集基础矿料',
    startDescription: '采掘不消耗材料；之后可冶炼金属锭、锻造工具坯，也可伐木、钓鱼、生火与烹饪。',
    startActionPrefix: '开始',
    nextStepHeading: '下一步',
    nextUnlockPrefix: '继续训练，达到 Lv',
    availableUpgradePrefix: '材料已备齐，可完成',
    replenishPrefix: '缺少以下材料，可采集补充',
    noDirectGather: '此材料没有直接采集来源，请在活动列表查看可继续的生产步骤。',
    switchToActivityPrefix: '切换到',
    cycleDiscardWarning: '切换会放弃未完成周期。',
    returnUnlockedPrefix: '可在活动列表查看新开放活动',
    returnCurrentGoal: '继续游戏后，可查看上方的下一步目标。',
    allContentAvailable: '当前已开放全部技能活动；可查看工具提升。',
    consumeAction: '食用',
    buffHeading: '生效增益',
    buffDescription: '食用消耗品可限时加速周期或提升技能经验；重复食用会刷新持续时间。',
    fuelHeading: '离线燃料',
    fuelDescription:
      '离开超过基础离线上限后，每份木炭延长 1 小时结算上限，最多延长 8 小时；农业等级会提高基础窗口（最高 +6 小时）。',
    shopHeading: '商店',
    shopDescription: '用偷窃所得硬币兑换基础材料；价格固定，不随库存变动。',
    shopBuyPrefix: '购买',
    shopCoinLabel: '硬币',
    sellHeading: '出售',
    sellDescription: '把多余材料换成硬币；价格固定，可重复兑换，出售即时到账。',
    sellActionPrefix: '出售',
    masteryHeading: '精通',
    masteryPoolLabel: '精通池',
    masterySpendAction: '注入',
    masteryCheckpointActive: '生效',
    masteryCheckpointLocked: '未达成',
    masteryCheckpointSpent: '因消耗失效',
  },
  // Base palette = the committed-strategy primitive era (see eras.ts for the scene sentence that
  // forces these values); era palettes replace it wholesale once the shell derives an era.
  colors: {
    background: 'oklch(0.16 0.022 55)',
    surface: 'oklch(0.21 0.028 55)',
    surfaceRaised: 'oklch(0.26 0.034 52)',
    text: 'oklch(0.96 0.010 60)',
    muted: 'oklch(0.77 0.024 55)',
    accent: 'oklch(0.80 0.15 60)',
    accentSoft: 'oklch(0.24 0.050 55)',
    border: 'oklch(0.35 0.038 55)',
  },
  skillCopy: {
    mining: { label: '采掘', description: '从矿层取得原料，并提升采集效率。' },
    metalworking: { label: '金工', description: '把矿料加工成金属锭与工具部件。' },
    woodcutting: { label: '伐木', description: '从林场取得原木与硬木，支撑燃料和木柄。' },
    fishing: { label: '钓鱼', description: '从水域取得生鱼，是烹饪的原料。' },
    firemaking: { label: '生火', description: '把木材烧成木炭，用于烹饪并延长离线结算。' },
    cooking: { label: '烹饪', description: '用木炭把生鱼烤成熟鱼，获得限时加速。' },
    crafting: { label: '制造', description: '把木材和金属锭做成木柄，升级各技能工具。' },
    herbalism: {
      label: '草药学',
      description: '采集洁净草与月光草，供炼金使用；学识反哺所有技能的经验获取。',
    },
    herblore: { label: '炼金', description: '把草药和空瓶熬成药水，提供限时增益。' },
    farming: {
      label: '农业',
      description: '收集种子并耕作，产出作物与药草；田间经验延长离线结算窗口。',
    },
    agility: { label: '敏捷', description: '通过障碍训练永久缩短全部活动的周期。' },
    thieving: { label: '偷窃', description: '窃取硬币与宝石，为商店兑换提供资金。' },
  },
  categoryCopy: {
    'raw-material': { label: '原料' },
    'processed-material': { label: '加工材料' },
    'tool-component': { label: '工具部件' },
    fuel: { label: '燃料' },
    consumable: { label: '消耗品' },
    currency: { label: '通货' },
    'trade-good': { label: '贵重品' },
  },
  itemCopy: {
    'common-ore': { label: '基础矿料' },
    clay: { label: '黏土' },
    'common-ingot': { label: '基础金属锭' },
    'common-tool-blank': { label: '基础工具坯' },
    'advanced-ore': { label: '进阶矿料' },
    'advanced-ingot': { label: '进阶金属锭' },
    'composite-tool-blank': { label: '复合工具坯' },
    'wood-log': { label: '原木' },
    hardwood: { label: '硬木' },
    'wood-charcoal': { label: '木炭' },
    'raw-fish': { label: '生鱼' },
    'fish-t2': { label: '深海鲜鱼' },
    'cooked-fish': { label: '熟鱼' },
    'meal-t2': { label: '什锦大餐' },
    'wood-handle': { label: '木柄' },
    'reinforced-handle': { label: '加固木柄' },
    'clean-herb': { label: '洁净草' },
    'moon-herb': { label: '月光草' },
    'wild-seed': { label: '野生种子' },
    'field-crop': { label: '田产作物' },
    'agility-mark': { label: '敏捷印记' },
    vial: { label: '空瓶' },
    coin: { label: '硬币' },
    gem: { label: '宝石' },
    'cleansing-potion': { label: '净化药水' },
    'clarity-potion': { label: '明晰药水' },
    'swift-potion': { label: '迅捷药水' },
    'ore-t3': { label: '赤铁矿石' },
    'wood-t3': { label: '铁木' },
    'herb-t3': { label: '赤焰草' },
    'fish-t3': { label: '深潭鱼' },
    coal: { label: '石炭' },
    'ingot-t3': { label: '赤铁锭' },
    'casing-t3': { label: '赤铁机壳' },
    'crop-t3': { label: '温室作物' },
    bait: { label: '鱼饵' },
    'food-t3': { label: '焖烧锅料理' },
    'potion-t3': { label: '强效经验药剂' },
    'ore-t4': { label: '星纹矿石' },
    'wood-t4': { label: '星纹木' },
    'herb-t4': { label: '星纹草' },
    'fish-t4': { label: '星纹鱼' },
    'ingot-t4': { label: '星纹锭' },
    'casing-t4': { label: '星纹机壳' },
    'crop-t4': { label: '高棚作物' },
    'food-t4': { label: '精炼口粮' },
    'potion-t4': { label: '星纹药剂' },
    'ore-t5': { label: '核心矿石' },
    'wood-t5': { label: '核心木' },
    'herb-t5': { label: '核心草' },
    'fish-t5': { label: '核心鱼' },
    'ingot-t5': { label: '核心锭' },
    'core-t5': { label: '核心组件' },
    'crop-t5': { label: '穹顶作物' },
    'food-t5': { label: '核心口粮' },
    'potion-t5': { label: '核心药剂' },
  },
  activityCopy: {
    'mine-common-ore': { label: '采集基础矿料', description: '无材料消耗，稳定获得基础矿料。' },
    'mine-rich-common-ore': { label: '采集富集矿层', description: '每周期获得两份基础矿料。' },
    'smelt-common-ingot': {
      label: '冶炼基础金属锭',
      description: '消耗两份基础矿料，产出一份金属锭。',
    },
    'forge-common-tool-blank': {
      label: '锻造基础工具坯',
      description: '消耗两份基础金属锭，制成工具坯。',
    },
    'mine-advanced-ore': {
      label: '采集进阶矿层',
      description: '采掘达到 Lv 3 后开放；每周期获得一份进阶矿料。',
    },
    'mine-advanced-ore-deep': {
      label: '深采进阶矿脉',
      description: '采掘达到 Lv 7 后开放；每周期获得两份进阶矿料。',
    },
    'smelt-advanced-ingot': {
      label: '冶炼进阶金属锭',
      description: '消耗两份进阶矿料，产出一份进阶金属锭。',
    },
    'forge-composite-tool-blank': {
      label: '锻造复合工具坯',
      description: '将基础与进阶金属锭组合成工具 III 的部件。',
    },
    'smelt-advanced-ingot-batch': {
      label: '批量冶炼进阶金属锭',
      description: '金工达到 Lv 7 后开放；四份进阶矿料配一份黏土模具，产出两份进阶金属锭。',
    },
    'smelt-common-ingot-batch': {
      label: '批量冶炼基础金属锭',
      description: '金工达到 Lv 8 后开放；四份基础矿料产出两份基础金属锭。',
    },
    'forge-composite-tool-blank-gem': {
      label: '宝石镶嵌工具坯',
      description: '金工达到 Lv 10 后开放；宝石配两份进阶金属锭，替代基础锭路线制成复合工具坯。',
    },
    'chop-wood-log': {
      label: '砍伐原木',
      description: '无材料消耗，稳定获得原木。',
    },
    'chop-hardwood': {
      label: '砍伐硬木',
      description: '伐木达到 Lv 2 后开放；每周期获得一份硬木。',
    },
    'chop-hardwood-grove': {
      label: '砍伐硬木林',
      description: '伐木达到 Lv 7 后开放；每周期获得两份硬木。',
    },
    'catch-raw-fish': {
      label: '钓生鱼',
      description: '无材料消耗，稳定获得生鱼。',
    },
    'catch-raw-fish-deep': {
      label: '深水钓鱼',
      description: '钓鱼达到 Lv 2 后开放；每周期获得两份生鱼。',
    },
    'catch-fish-t2': {
      label: '捕捞深海鲜鱼',
      description: '钓鱼达到 Lv 7 后开放；每周期获得两份深海鲜鱼。',
    },
    'burn-charcoal': {
      label: '烧制木炭',
      description: '消耗两份原木，产出一份木炭。',
    },
    'burn-charcoal-hardwood': {
      label: '硬木烧炭',
      description: '生火达到 Lv 2 后开放；每份硬木产出两份木炭。',
    },
    'burn-charcoal-kiln': {
      label: '陶窑烧炭',
      description: '生火达到 Lv 7 后开放；两份硬木产出四份木炭。',
    },
    'cook-raw-fish': {
      label: '烤熟鱼',
      description: '消耗一份生鱼和一份木炭，产出一份熟鱼。',
    },
    'cook-fish-feast': {
      label: '烹制鱼宴',
      description: '烹饪达到 Lv 2 后开放；两份生鱼配两份木炭，产出两份熟鱼。',
    },
    'cook-fish-feast-t2': {
      label: '烹制海鲜鱼宴',
      description: '烹饪达到 Lv 7 后开放；一份深海鲜鱼配一份木炭，产出两份熟鱼。',
    },
    'cook-meal-t2': {
      label: '烹制什锦大餐',
      description: '烹饪达到 Lv 10 后开放；深海鲜鱼配田产作物与木炭，产出三份什锦大餐。',
    },
    'craft-wood-handle': {
      label: '制作木柄',
      description: '消耗两份原木，产出木柄，用于工具 II 提升。',
    },
    'craft-clay-vial': {
      label: '烧制空瓶',
      description: '消耗两份黏土，产出空瓶；让炼金不再只能靠商店补瓶。',
    },
    'craft-reinforced-handle': {
      label: '制作加固木柄',
      description: '制造达到 Lv 2 后开放；硬木配基础金属锭，用于工具 III 提升。',
    },
    'craft-reinforced-handle-batch': {
      label: '批量制作加固木柄',
      description: '制造达到 Lv 9 后开放；四份硬木配两份基础金属锭，产出两份加固木柄。',
    },
    'gather-clean-herb': {
      label: '采集洁净草',
      description: '无材料消耗，稳定获得洁净草。',
    },
    'gather-moon-herb': {
      label: '采集月光草',
      description: '草药学达到 Lv 2 后开放；每周期获得一份月光草。',
    },
    'gather-moon-herb-grove': {
      label: '采集月光草丛',
      description: '草药学达到 Lv 7 后开放；每周期获得两份月光草。',
    },
    'brew-cleansing-potion': {
      label: '熬制净化药水',
      description: '两份洁净草配一只空瓶，产出一瓶加速药水。',
    },
    'brew-clarity-potion': {
      label: '熬制明晰药水',
      description: '炼金达到 Lv 2 后开放；月光草配空瓶，产出经验加成药水。',
    },
    'brew-swift-potion': {
      label: '熬制迅捷药水',
      description: '炼金达到 Lv 3 后开放；月光草与敏捷印记配空瓶，产出强效加速药水。',
    },
    'brew-cleansing-potion-batch': {
      label: '批量熬制净化药水',
      description: '炼金达到 Lv 7 后开放；四份洁净草配两只空瓶，产出两瓶净化药水。',
    },
    'brew-swift-potion-batch': {
      label: '批量熬制迅捷药水',
      description: '炼金达到 Lv 9 后开放；月光草与敏捷印记配空瓶，产出两瓶迅捷药水。',
    },
    'gather-wild-seed': {
      label: '收集野生种子',
      description: '无材料消耗，稳定获得野生种子。',
    },
    'plant-field-crop': {
      label: '播种田产作物',
      description: '消耗野生种子，长周期产出田产作物。',
    },
    'grow-moon-herb': {
      label: '栽培月光草',
      description: '农业达到 Lv 2 后开放；种子配作物，田间产出月光草。',
    },
    'cultivate-abundant-harvest': {
      label: '培育丰产田',
      description: '农业达到 Lv 3 后开放；投入更多种子与作物，大幅提高作物产量。',
    },
    'grow-moon-herb-batch': {
      label: '栽培月光草田',
      description: '农业达到 Lv 8 后开放；四份种子配两份作物，产出四份月光草。',
    },
    'run-agility-course': {
      label: '跑障碍训练场',
      description: '无材料消耗，获得敏捷印记并积累敏捷经验。',
    },
    'run-obstacle-circuit': {
      label: '跑障碍环线',
      description: '敏捷达到 Lv 2 后开放；每周期获得两份敏捷印记。',
    },
    'run-endurance-trial': {
      label: '跑耐力试炼',
      description: '敏捷达到 Lv 3 后开放；每周期获得三份敏捷印记。',
    },
    'run-endurance-circuit': {
      label: '跑耐力环线',
      description: '敏捷达到 Lv 7 后开放；每周期获得四份敏捷印记。',
    },
    pickpocket: {
      label: '扒窃路人',
      description: '无材料消耗，稳定获得硬币。',
    },
    'burgle-storehouse': {
      label: '窃取货栈',
      description: '偷窃达到 Lv 2 后开放；每周期获得五枚硬币。',
    },
    'heist-vault': {
      label: '洗劫金库',
      description: '偷窃达到 Lv 3 后开放；硬币之外还会带出一颗宝石。',
    },
    'heist-gem-vault': {
      label: '洗劫宝石库',
      description: '偷窃达到 Lv 7 后开放；十二枚硬币之外还会带出一颗宝石。',
    },
    'mine-ore-t3': {
      label: '采掘赤铁矿',
      description: '采掘达到 Lv 13 后开放；每周期获得两份赤铁矿石。',
    },
    'mine-ore-t3-deep': {
      label: '深采赤铁矿脉',
      description: '采掘达到 Lv 16 后开放；每周期获得三份赤铁矿石。',
    },
    'chop-wood-t3': {
      label: '砍伐铁木',
      description: '伐木达到 Lv 13 后开放；每周期获得两份铁木。',
    },
    'chop-wood-t3-grove': {
      label: '砍伐铁木林',
      description: '伐木达到 Lv 16 后开放；每周期获得三份铁木。',
    },
    'gather-herb-t3': {
      label: '采集赤焰草',
      description: '草药学达到 Lv 13 后开放；每周期获得两份赤焰草。',
    },
    'burn-coal-kiln': {
      label: '窑烧石炭',
      description: '生火达到 Lv 13 后开放；两份铁木产出两份石炭。',
    },
    'smelt-ingot-t3': {
      label: '冶炼赤铁锭',
      description: '金工达到 Lv 13 后开放；两份赤铁矿石配一份石炭，产出一份赤铁锭。',
    },
    'smelt-ingot-t3-batch': {
      label: '批量冶炼赤铁锭',
      description: '金工达到 Lv 16 后开放；四份矿石配两份石炭，产出三份赤铁锭。',
    },
    'craft-casing-t3': {
      label: '装配赤铁机壳',
      description: '制造达到 Lv 14 后开放；两份赤铁锭配一份铁木，产出赤铁机壳。',
    },
    'forge-casing-t3-batch': {
      label: '批量锻造赤铁机壳',
      description: '金工达到 Lv 17 后开放；四份赤铁锭配两份铁木，产出三份赤铁机壳。',
    },
    'harvest-crop-t3': {
      label: '收获温室作物',
      description: '农业达到 Lv 13 后开放；三份野生种子配两份田产作物，产出四份温室作物。',
    },
    'craft-fish-bait': {
      label: '制作鱼饵',
      description: '农业达到 Lv 14 后开放；两份温室作物产出三份鱼饵，供钓鱼使用。',
    },
    'catch-fish-t3-bait': {
      label: '饵钓深潭鱼',
      description: '钓鱼达到 Lv 15 后开放；一份鱼饵产出三份深潭鱼。',
    },
    'cook-food-t3': {
      label: '烹制焖烧锅料理',
      description: '烹饪达到 Lv 16 后开放；深潭鱼配温室作物与木炭，产出三份料理。',
    },
    'cook-food-t3-feast': {
      label: '烹制焖烧锅大餐',
      description: '烹饪达到 Lv 17 后开放；三份深潭鱼配三份木炭，产出五份料理。',
    },
    'brew-potion-t3': {
      label: '熬制强效经验药剂',
      description: '炼金达到 Lv 13 后开放；两份赤焰草配一只空瓶，产出一瓶经验药剂。',
    },
    'brew-potion-t3-batch': {
      label: '批量熬制经验药剂',
      description: '炼金达到 Lv 16 后开放；四份赤焰草配两只空瓶，产出三瓶经验药剂。',
    },
    'run-circuit-t3': {
      label: '跑蒸汽环线',
      description: '敏捷达到 Lv 13 后开放；每周期获得六枚敏捷印记。',
    },
    'heist-t3-vault': {
      label: '洗劫工业金库',
      description: '偷窃达到 Lv 13 后开放；二十枚硬币之外还会带出一颗宝石。',
    },
    'mine-ore-t4': {
      label: '采掘星纹矿',
      description: '采掘达到 Lv 19 后开放；每周期获得两份星纹矿石。',
    },
    'mine-ore-t4-deep': {
      label: '深采星纹矿脉',
      description: '采掘达到 Lv 22 后开放；每周期获得三份星纹矿石。',
    },
    'chop-wood-t4': {
      label: '砍伐星纹木',
      description: '伐木达到 Lv 19 后开放；每周期获得两份星纹木。',
    },
    'chop-wood-t4-grove': {
      label: '砍伐星纹木林',
      description: '伐木达到 Lv 22 后开放；每周期获得三份星纹木。',
    },
    'gather-herb-t4': {
      label: '采集星纹草',
      description: '草药学达到 Lv 19 后开放；每周期获得两份星纹草。',
    },
    'burn-coke-kiln': {
      label: '窑烧焦炭',
      description: '生火达到 Lv 19 后开放；两份星纹木产出四份石炭。',
    },
    'smelt-ingot-t4': {
      label: '冶炼星纹锭',
      description: '金工达到 Lv 19 后开放；两份星纹矿石配两份石炭，产出星纹锭。',
    },
    'smelt-ingot-t4-batch': {
      label: '批量冶炼星纹锭',
      description: '金工达到 Lv 22 后开放；四份矿石配四份石炭，产出三份星纹锭。',
    },
    'craft-casing-t4-refined': {
      label: '精制星纹机壳',
      description: '制造达到 Lv 20 后开放；两份星纹木配一份星纹锭，产出星纹机壳。',
    },
    'forge-casing-t4': {
      label: '锻造星纹机壳',
      description: '金工达到 Lv 21 后开放；赤铁机壳配两份星纹锭，产出星纹机壳。',
    },
    'forge-casing-t4-batch': {
      label: '批量锻造星纹机壳',
      description: '金工达到 Lv 23 后开放；两份机壳配四份星纹锭，产出三份星纹机壳。',
    },
    'harvest-crop-t4': {
      label: '收获高棚作物',
      description: '农业达到 Lv 19 后开放；四份种子配两份温室作物，产出四份高棚作物。',
    },
    'catch-fish-t4-bait': {
      label: '饵钓星纹鱼',
      description: '钓鱼达到 Lv 20 后开放；两份鱼饵产出三份星纹鱼。',
    },
    'cook-food-t4': {
      label: '烹制精炼口粮',
      description: '烹饪达到 Lv 21 后开放；星纹鱼配高棚作物与木炭，产出三份精炼口粮。',
    },
    'cook-food-t4-feast': {
      label: '烹制精炼大餐',
      description: '烹饪达到 Lv 23 后开放；三份星纹鱼配两份作物与木炭，产出五份口粮。',
    },
    'brew-potion-t4': {
      label: '熬制星纹药剂',
      description: '炼金达到 Lv 19 后开放；两份星纹草配一只空瓶，产出一瓶星纹药剂。',
    },
    'brew-potion-t4-batch': {
      label: '批量熬制星纹药剂',
      description: '炼金达到 Lv 22 后开放；四份星纹草配两只空瓶，产出三瓶星纹药剂。',
    },
    'run-circuit-t4': {
      label: '跑仪表环线',
      description: '敏捷达到 Lv 19 后开放；每周期获得十枚敏捷印记。',
    },
    'heist-t4-vault': {
      label: '洗劫精炼金库',
      description: '偷窃达到 Lv 19 后开放；四十枚硬币之外还会带出两颗宝石。',
    },
    'mine-ore-t5': {
      label: '采掘核心矿',
      description: '采掘达到 Lv 25 后开放；每周期获得两份核心矿石。',
    },
    'mine-ore-t5-deep': {
      label: '深采核心矿脉',
      description: '采掘达到 Lv 28 后开放；每周期获得三份核心矿石。',
    },
    'chop-wood-t5': {
      label: '砍伐核心木',
      description: '伐木达到 Lv 25 后开放；每周期获得两份核心木。',
    },
    'chop-wood-t5-grove': {
      label: '砍伐核心木林',
      description: '伐木达到 Lv 28 后开放；每周期获得三份核心木。',
    },
    'gather-herb-t5': {
      label: '采集核心草',
      description: '草药学达到 Lv 25 后开放；每周期获得两份核心草。',
    },
    'burn-coke-t5': {
      label: '窑烧核心炭',
      description: '生火达到 Lv 25 后开放；两份核心木产出六份石炭。',
    },
    'smelt-ingot-t5': {
      label: '冶炼核心锭',
      description: '金工达到 Lv 25 后开放；两份核心矿石配三份石炭，产出核心锭。',
    },
    'smelt-ingot-t5-batch': {
      label: '批量冶炼核心锭',
      description: '金工达到 Lv 28 后开放；四份矿石配六份石炭，产出三份核心锭。',
    },
    'craft-core-t5-refined': {
      label: '精制核心组件',
      description: '制造达到 Lv 26 后开放；两份核心木配一份核心锭，产出核心组件。',
    },
    'forge-core-t5': {
      label: '锻造核心组件',
      description: '金工达到 Lv 27 后开放；星纹机壳配两份核心锭，产出核心组件。',
    },
    'forge-core-t5-batch': {
      label: '批量锻造核心组件',
      description: '金工达到 Lv 29 后开放；两份机壳配四份核心锭，产出三份核心组件。',
    },
    'harvest-crop-t5': {
      label: '收获穹顶作物',
      description: '农业达到 Lv 25 后开放；五份种子配两份高棚作物，产出四份穹顶作物。',
    },
    'catch-fish-t5-bait': {
      label: '饵钓核心鱼',
      description: '钓鱼达到 Lv 26 后开放；三份鱼饵产出三份核心鱼。',
    },
    'cook-food-t5': {
      label: '烹制核心口粮',
      description: '烹饪达到 Lv 27 后开放；核心鱼配穹顶作物与木炭，产出三份核心口粮。',
    },
    'cook-food-t5-feast': {
      label: '烹制核心大餐',
      description: '烹饪达到 Lv 29 后开放；三份核心鱼配两份作物与木炭，产出五份口粮。',
    },
    'brew-potion-t5': {
      label: '熬制核心药剂',
      description: '炼金达到 Lv 27 后开放；核心组件配两份核心草与空瓶，产出核心药剂。',
    },
    'brew-potion-t5-batch': {
      label: '批量熬制核心药剂',
      description: '炼金达到 Lv 29 后开放；两份组件配四份核心草与空瓶，产出三瓶。',
    },
    'run-circuit-t5': {
      label: '跑全息环线',
      description: '敏捷达到 Lv 25 后开放；每周期获得十六枚敏捷印记。',
    },
    'heist-t5-vault': {
      label: '洗劫核心金库',
      description: '偷窃达到 Lv 25 后开放；八十枚硬币之外还会带出三颗宝石。',
    },
  },
  recipeCopy: {
    'recipe-common-ingot': { label: '基础金属锭配方' },
    'recipe-common-tool-blank': { label: '基础工具坯配方' },
    'recipe-advanced-ingot': { label: '进阶金属锭配方' },
    'recipe-composite-tool-blank': { label: '复合工具坯配方' },
    'recipe-charcoal': { label: '木炭配方' },
    'recipe-charcoal-hardwood': { label: '硬木烧炭配方' },
    'recipe-cooked-fish': { label: '烤熟鱼配方' },
    'recipe-fish-feast': { label: '鱼宴配方' },
    'recipe-wood-handle': { label: '木柄配方' },
    'recipe-reinforced-handle': { label: '加固木柄配方' },
    'recipe-cleansing-potion': { label: '净化药水配方' },
    'recipe-clarity-potion': { label: '明晰药水配方' },
    'recipe-swift-potion': { label: '迅捷药水配方' },
    'recipe-field-crop': { label: '田产作物配方' },
    'recipe-farm-moon-herb': { label: '月光草田配方' },
    'recipe-abundant-harvest': { label: '丰产田配方' },
    'recipe-clay-vial': { label: '空瓶配方' },
    'recipe-common-ingot-batch': { label: '批量基础金属锭配方' },
    'recipe-advanced-ingot-batch': { label: '批量进阶金属锭配方' },
    'recipe-composite-tool-blank-gem': { label: '宝石工具坯配方' },
    'recipe-charcoal-kiln': { label: '陶窑烧炭配方' },
    'recipe-fish-feast-t2': { label: '海鲜鱼宴配方' },
    'recipe-meal-t2': { label: '什锦大餐配方' },
    'recipe-reinforced-handle-batch': { label: '批量加固木柄配方' },
    'recipe-cleansing-potion-batch': { label: '批量净化药水配方' },
    'recipe-swift-potion-batch': { label: '批量迅捷药水配方' },
    'recipe-moon-herb-batch': { label: '月光草田配方' },
    'recipe-coal-kiln': { label: '石炭窑烧配方' },
    'recipe-ingot-t3': { label: '赤铁锭配方' },
    'recipe-ingot-t3-batch': { label: '批量赤铁锭配方' },
    'recipe-casing-t3': { label: '赤铁机壳配方' },
    'recipe-casing-t3-batch': { label: '批量赤铁机壳配方' },
    'recipe-crop-t3': { label: '温室作物配方' },
    'recipe-bait': { label: '鱼饵配方' },
    'recipe-fish-t3': { label: '深潭鱼饵钓配方' },
    'recipe-food-t3': { label: '焖烧锅料理配方' },
    'recipe-food-t3-feast': { label: '焖烧锅大餐配方' },
    'recipe-potion-t3': { label: '强效经验药剂配方' },
    'recipe-potion-t3-batch': { label: '批量经验药剂配方' },
    'recipe-coke-kiln': { label: '焦炭窑烧配方' },
    'recipe-ingot-t4': { label: '星纹锭配方' },
    'recipe-ingot-t4-batch': { label: '批量星纹锭配方' },
    'recipe-casing-t4': { label: '星纹机壳配方' },
    'recipe-casing-t4-batch': { label: '批量星纹机壳配方' },
    'recipe-casing-t4-refined': { label: '精制星纹机壳配方' },
    'recipe-crop-t4': { label: '高棚作物配方' },
    'recipe-fish-t4': { label: '星纹鱼饵钓配方' },
    'recipe-food-t4': { label: '精炼口粮配方' },
    'recipe-food-t4-feast': { label: '精炼大餐配方' },
    'recipe-potion-t4': { label: '星纹药剂配方' },
    'recipe-potion-t4-batch': { label: '批量星纹药剂配方' },
    'recipe-coke-t5': { label: '核心炭窑烧配方' },
    'recipe-ingot-t5': { label: '核心锭配方' },
    'recipe-ingot-t5-batch': { label: '批量核心锭配方' },
    'recipe-core-t5': { label: '核心组件配方' },
    'recipe-core-t5-batch': { label: '批量核心组件配方' },
    'recipe-core-t5-refined': { label: '精制核心组件配方' },
    'recipe-crop-t5': { label: '穹顶作物配方' },
    'recipe-fish-t5': { label: '核心鱼饵钓配方' },
    'recipe-food-t5': { label: '核心口粮配方' },
    'recipe-food-t5-feast': { label: '核心大餐配方' },
    'recipe-potion-t5': { label: '核心药剂配方' },
    'recipe-potion-t5-batch': { label: '批量核心药剂配方' },
  },
  toolCopy: {
    'mining-tool': { label: '采掘工具', effect: '缩短采掘周期' },
    'mining-tool-ii': { label: '采掘工具 II', effect: '采掘周期缩短至基础周期的 80%' },
    'mining-tool-iii': { label: '采掘工具 III', effect: '采掘周期缩短至基础周期的 65%' },
    'woodcutting-tool': { label: '伐木工具', effect: '缩短伐木周期' },
    'woodcutting-tool-ii': { label: '伐木工具 II', effect: '伐木周期缩短至基础周期的 80%' },
    'woodcutting-tool-iii': { label: '伐木工具 III', effect: '伐木周期缩短至基础周期的 65%' },
    'fishing-tool': { label: '钓具', effect: '缩短钓鱼周期' },
    'fishing-tool-ii': { label: '钓具 II', effect: '钓鱼周期缩短至基础周期的 82%' },
    'fishing-tool-iii': { label: '钓具 III', effect: '钓鱼周期缩短至基础周期的 68%' },
    'metalworking-tool': { label: '金工工具', effect: '缩短金工周期' },
    'metalworking-tool-ii': { label: '金工工具 II', effect: '金工周期缩短至基础周期的 86%' },
    'metalworking-tool-iii': { label: '金工工具 III', effect: '金工周期缩短至基础周期的 74%' },
    'crafting-tool': { label: '制造工具', effect: '缩短制造周期' },
    'crafting-tool-ii': { label: '制造工具 II', effect: '制造周期缩短至基础周期的 86%' },
    'mining-tool-iv': { label: '采掘工具 IV', effect: '采掘周期缩短至基础周期的 60%' },
    'mining-tool-v': { label: '采掘工具 V', effect: '采掘周期缩短至基础周期的 55%' },
    'woodcutting-tool-iv': { label: '伐木工具 IV', effect: '伐木周期缩短至基础周期的 60%' },
    'woodcutting-tool-v': { label: '伐木工具 V', effect: '伐木周期缩短至基础周期的 55%' },
    'fishing-tool-iv': { label: '钓具 IV', effect: '钓鱼周期缩短至基础周期的 62%' },
    'fishing-tool-v': { label: '钓具 V', effect: '钓鱼周期缩短至基础周期的 57%' },
    'metalworking-tool-iv': { label: '金工工具 IV', effect: '金工周期缩短至基础周期的 66%' },
    'metalworking-tool-v': { label: '金工工具 V', effect: '金工周期缩短至基础周期的 60%' },
    'crafting-tool-iii': { label: '制造工具 III', effect: '制造周期缩短至基础周期的 74%' },
    'crafting-tool-iv': { label: '制造工具 IV', effect: '制造周期缩短至基础周期的 66%' },
    'crafting-tool-v': { label: '制造工具 V', effect: '制造周期缩短至基础周期的 60%' },
  },
};

function validateCopyRecord(
  copy: Readonly<Record<string, unknown>>,
  ids: ReadonlySet<string>,
  field: string,
): void {
  const keys = Object.keys(copy);
  if (keys.length !== ids.size || keys.some((id) => !ids.has(id)))
    throw new Error(`Skill-loop theme ${field} does not exactly match mechanics content`);
  for (const [id, value] of Object.entries(copy)) {
    if (value === null || typeof value !== 'object')
      throw new Error(`Missing skill-loop theme copy: ${field}/${id}`);
    for (const text of Object.values(value as Record<string, unknown>)) {
      if (typeof text !== 'string' || text.trim().length === 0)
        throw new Error(`Empty skill-loop theme text: ${field}/${id}`);
    }
  }
}

/** The single assembly gate keeps display names out of mechanics and rejects orphan copy. */
export function validateSkillPrototypeV1Theme(
  definition: SkillLoopDefinition,
  theme: SkillLoopTheme,
): void {
  if (theme.id !== definition.profileId) throw new Error('Skill-loop theme/profile mismatch');
  for (const [key, text] of Object.entries(theme.uiCopy)) {
    if (typeof text !== 'string' || text.trim().length === 0)
      throw new Error(`Empty skill-loop theme text: app/${key}`);
  }
  for (const value of Object.values(theme.colors)) {
    if (!/^#[0-9a-f]{6}$/i.test(value) && !/^oklch\(\s*[\d.]+\s+[\d.]+\s+[\d.]+\s*\)$/i.test(value))
      throw new Error('Invalid skill-loop theme color');
  }
  validateCopyRecord(
    theme.skillCopy,
    new Set(definition.skills.map((entry) => entry.id)),
    'skills',
  );
  validateCopyRecord(
    theme.categoryCopy,
    new Set(definition.itemCategories.map((entry) => entry.id)),
    'item categories',
  );
  validateCopyRecord(theme.itemCopy, new Set(definition.items.map((entry) => entry.id)), 'items');
  validateCopyRecord(
    theme.activityCopy,
    new Set(definition.activities.map((entry) => entry.id)),
    'activities',
  );
  validateCopyRecord(
    theme.recipeCopy,
    new Set(definition.recipes.map((entry) => entry.id)),
    'recipes',
  );
  validateCopyRecord(
    theme.toolCopy,
    new Set([
      ...definition.tools.map((entry) => entry.id),
      ...definition.toolUpgrades.map((entry) => entry.id),
    ]),
    'tools',
  );
}
