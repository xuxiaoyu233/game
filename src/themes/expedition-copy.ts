import type {
  BuildingId,
  PerkId,
  ResearchNodeId,
  StanceId,
  WorkerPresetId,
  WorkerRole,
  WorldVariantId,
} from '../domain/expedition/types';

/** Presentation only. Costs, production, defense, and rewards come from the definition. */
export const WORLD_COPY: Record<
  string,
  {
    readonly name: string;
    readonly subtitle: string;
    readonly description: string;
    readonly objective: string;
    readonly beaconText: string;
    readonly accent?: string;
  }
> = {
  forest: {
    name: '迷雾森林',
    subtitle: '树影里的营地，怪潮前的取舍',
    description:
      '森林深处的航标反复呼叫返航者。带领四名投影队员建立接收营地，在怪潮中稳定信号，寻找回家的第一段坐标。',
    objective: '搭好避难棚、守住前两波，成功回归带走返航信号；调查残刻可追查值守员的过去。',
    beaconText: '旧烽火台隐在树影里。残存的结构既能拆成建材，也能修成营地的屏障。',
    accent: '#89c99b',
  },
  ruins: {
    name: '古城遗迹',
    subtitle: '断壁之间，重建防线',
    description:
      '森林信号指向这座旧城，但建站日期比信号本身更晚。在断壁间建立译码营地，守住记录，并决定是否花费防守物资追查被删去的历史。',
    objective: '守住两波、成功回归带走建站记录；调查石碑可补全航标重启的证据。',
    beaconText: '城墙下还有一座熄灭的烽火台。你可以取走残留建材，也可以让它重新成为防线。',
    accent: '#e6b779',
  },
  'snow-observatory': {
    name: '雪线观测站',
    subtitle: '低温中的供能与修复',
    description:
      '古城记录指向一座被暴风雪封住的观测站。维持燃料与热量，修复发电机，逐段恢复返航校时记录。',
    objective: '完成三处主线校时记录并修复发电机后可回归；也可锁定成果，再做第四处可选记录。',
    beaconText: '雪站不设烽火台；请在环境节点处理燃料、温度与发电机。',
    accent: '#8ac8dc',
  },
  'world-unlisted-city': {
    name: '失籍城·第七避难环',
    subtitle: '城市仍在，名册却说无人需要救援',
    description:
      '救援回执显示住户已被接回，第七环现场仍持续发出求援。你要稳住界锚、建设临时避难区，并核对现场人口与系统记录。',
    objective: '建成临时避难所并守住两次界潮，即可安全回归；返场可选择审计缺页街区或回收户籍副页。',
    beaconText: '本世界以界锚稳定度决定支线调查的可达性；不依赖随机事件完成基础救援。',
    accent: '#87cbbd',
  },
};

export const BUILDING_COPY: Record<
  BuildingId,
  { readonly name: string; readonly description: string; readonly icon: string }
> = {
  shelter: {
    name: '临时避难所',
    description: '搭起居民与队员的安全区，满足基础救援回归条件。',
    icon: '⛺',
  },
  'lumber-camp': {
    name: '能芯回收台',
    description: '从废弃街区回收能芯，投入后持续补充供能物资。',
    icon: '🌲',
  },
  quarry: {
    name: '锚材工坊',
    description: '加工现场残件，持续补充用于界锚加固的锚材。',
    icon: '⛏',
  },
  wall: {
    name: '环区屏障',
    description: '加固第七环边界，降低界潮冲击造成的队员损伤。',
    icon: '🧱',
  },
  tower: {
    name: '信号瞭望台',
    description: '提前发现界潮来向，提高防御并辅助稳定界锚。',
    icon: '🏹',
  },
  monument: {
    name: '证据保全柜',
    description: '封存临时调查材料，成功回归时换取额外界点。',
    icon: '🗿',
  },
};

export const PERK_COPY: Record<PerkId, { readonly name: string; readonly description: string }> = {
  'harvest-training': {
    name: '现场回收训练',
    description: '提升现场补采效率，进入下一次行动后生效。',
  },
  'reinforced-core': {
    name: '加固装备',
    description: '提高队员承伤能力，进入下一次行动后生效。',
  },
  'field-repair': {
    name: '现场修复',
    description: '解锁一次局内紧急治疗，使用后本次行动不能再次修复。',
  },
};

export const RESEARCH_COPY: Record<
  ResearchNodeId,
  { readonly name: string; readonly description: string }
> = {
  'production-budget': {
    name: '补给测算',
    description: '首座生产设施减免固定能芯与锚材，让局前配置能改变开局路线。',
  },
  'battle-bracing': {
    name: '界潮支架',
    description: '待迎战时可主动启用一次，降低下一次界潮造成的损伤。',
  },
  'evidence-ledger': {
    name: '证据保全规程',
    description: '本次行动首次调查减免固定资源，不改变证据内容或归档条件。',
  },
};

export const WORLD_VARIANT_COPY: Record<
  WorldVariantId,
  { readonly name: string; readonly description: string }
> = {
  'forest-river-survey': {
    name: '沿河测绘',
    description: '以石料补给开局，河桥事件保留测绘与边界两种处理。',
  },
  'forest-boundary-watch': {
    name: '边界值守',
    description: '以木料补给开局，任务转向修筑两段边界防线。',
  },
  'ruins-observatory': {
    name: '逆行观测',
    description: '以石料补给开局，追查河道坐标并建成观测站。',
  },
  'ruins-relief-route': {
    name: '补给救援',
    description: '以木料补给开局，修复撤离通路并保障后续救援。',
  },
  'snow-fuel-cache': {
    name: '燃料木料补给',
    description: '开局多 6 木料，可选择添炉补燃料，也可留给生产和建设。',
  },
  'snow-radiator-salvage': {
    name: '散热器检修件',
    description: '开局多 6 石料，可用于发电机修复或建设；燃料仍需用木料补充。',
  },
};

export const REWARD_COPY: Readonly<Record<string, string>> = {
  base: '营地生存任务',
  monument: '历史建筑奖励',
  beacon: '烽火台修复奖励',
  'final-wave': '终局怪潮奖励',
  'boosted-final': '强化怪潮奖励',
  initiative: '提前迎战奖励',
  difficulty: '难度条款奖励',
};

export const DIFFICULTY_MODIFIER_COPY: Readonly<
  Record<string, { readonly name: string; readonly description: string }>
> = {
  'supply-shortage': {
    name: '补给短缺',
    description: '开局木头和石头库存各减少 25%。',
  },
  'compressed-preparation': {
    name: '压缩准备',
    description: '生存副本备战时间与雪站阶段时间缩短 20%。',
  },
  'intensified-threat': {
    name: '威胁升级',
    description: '怪潮强度提高 15%；雪站燃料消耗提高 20%。',
  },
  'frozen-appropriation': {
    name: '临时拨款冻结',
    description: '总台只拨付最低应急库存；开局能芯与锚材各减少 25%。难度 +1。来源：第七环求援。',
  },
  'early-tide': {
    name: '界潮提前',
    description: '总台收到的灾变窗口比纸本预警短 20%。难度 +2。来源：第七环求援。',
  },
  'exposed-anchor': {
    name: '锚点暴露',
    description:
      '强锚信号能稳住回归点，也会吸引界潮生物；敌潮强度提高 15%。难度 +2。来源：第七环求援。',
  },
};

export const CONTRACT_COPY: Readonly<
  Record<
    string,
    { readonly name: string; readonly description: string; readonly unlockHint?: string | null }
  >
> = {
  'forest-secure-signal': {
    name: '守住返航信号',
    description: '搭建避难棚并守住两波怪潮，带回森林的第一段坐标。',
    unlockHint: null,
  },
  'forest-survey-contract': {
    name: '信号与河岸测绘',
    description: '完成基础返航任务，并可处理河桥事件、派队测绘，带回额外档案与积分。',
    unlockHint: null,
  },
  'forest-perimeter-contract': {
    name: '边界守卫',
    description: '完成基础返航任务，并建成两段木石防线。河桥事件中还能选择测绘旧道或加固边界信标。',
    unlockHint: '成功完成一次森林返航后开放。',
  },
  'ruins-recover-record': {
    name: '回收建站记录',
    description: '搭建避难棚并守住两波怪潮，带回古城的建站记录。',
    unlockHint: null,
  },
  'ruins-observatory-contract': {
    name: '逆行观测站',
    description: '搭建避难棚、瞭望塔和一段防线，守住三波怪潮，追查河道指向的观测站。',
    unlockHint: '在主空间选择追查坐标后开放；完成并回归后，也可返场接通补给线。',
  },
  'ruins-relief-contract': {
    name: '古城救援补给线',
    description: '搭建避难棚、两道墙和伐木场，守住两波怪潮，接通失散队伍的补给线。',
    unlockHint: '在主空间选择保护补给后开放；完成并回归后，也可返场追查观测站。',
  },
  'snow-recover-record': {
    name: '恢复航标校时记录',
    description:
      '在低温中逐步恢复三处校时记录，并将发电机修复到回归门槛。达到目标后可立即回归，或锁定成果挑战第四处可选记录。',
    unlockHint: null,
  },
  'contract-secure-seventh-ring': {
    name: '稳住第七环',
    description: '建成临时避难所并守住两次界潮，带回未登记求援回执。',
    unlockHint: null,
  },
  'contract-audit-missing-district': {
    name: '审计缺页街区',
    description: '完成基础救援后，派队核查一处被系统登记为空屋的街区，尝试带回住户灯号记录。',
    unlockHint: '完成一次第七环基础救援后开放。',
  },
  'contract-recover-household-page': {
    name: '回收户籍副页',
    description: '完成基础救援后，保全人口纸本中多出的一页；调查会占用队员与锚材。',
    unlockHint: '完成一次第七环基础救援后开放。',
  },
};

export const OBJECTIVE_COPY: Readonly<
  Record<
    string,
    { readonly name: string; readonly description: string; readonly returnText: string }
  >
> = {
  'forest-secure-camp': {
    name: '稳定森林航标',
    description: '建成避难棚，并至少守住两波怪潮。',
    returnText: '森林航标的返航信号已被带回主空间。岑将它标记为零号坐标。',
  },
  'forest-river-survey': {
    name: '测绘河岸旧道',
    description: '选择修复河桥后，派出一名队员完成 45 秒测绘。项目和奖励只在成功回归后结算。',
    returnText:
      '河道旧桥下的测绘册被带回主空间。记录显示，这条河曾在地图上流向一座尚未建成的城市。',
  },
  'forest-build-perimeter': {
    name: '筑起边界防线',
    description: '搭建避难棚、修建两道木石墙，并守住两波怪潮。',
    returnText: '两段旧墙的刻痕记录了另一支队伍如何把森林边缘守到天亮。',
  },
  'forest-relay-inspection': {
    name: '加固边界信标',
    description: '在边界守卫契约中，选择加固方案并派出一名采石队员完成 60 秒作业。',
    returnText: '信标基座里有一枚来自古城的编号牌，说明这条边界曾被另一支远征队标记。',
  },
  'ruins-secure-record': {
    name: '回收古城记录',
    description: '建成避难棚，并至少守住两波怪潮。',
    returnText: '古城的建站记录已被带回主空间，与森林信号的年代出现矛盾。',
  },
  'ruins-build-observatory': {
    name: '点亮观测站',
    description: '建成避难棚、瞭望塔和一段防线，并守住三波怪潮。',
    returnText: '逆行星图指向森林河道的源头。岑把观测站坐标存入永久档案。',
  },
  'ruins-restore-supply-line': {
    name: '接通撤离补给线',
    description: '建成避难棚、两道墙和一座伐木场，并守住两波怪潮。',
    returnText: '救援名册证明撤离队伍确实经过古城，但名单上的幸存者仍没有下落。',
  },
  'ruins-stocked-tower': {
    name: '搭建第二座瞭望塔',
    description: '额外搭建一座瞭望塔，完成后可获得额外永久积分。',
    returnText: '第二座瞭望塔的光束照亮了古城另一端的屋顶。',
  },
  'snow-repair-generator': {
    name: '修复观测站发电机',
    description: '在回归前将发电机完整度修复至 75。修复与供暖共用本局木石。',
    returnText: '发电机恢复后，校时记录重新亮起；返航门槛已满足。',
  },
  'snow-align-record': {
    name: '拼接三处校时记录',
    description: '在环境节点间选择是否供暖，完成三处记录后可回归。',
    returnText:
      '三处记录的时间顺序彼此矛盾，证明片段顺序曾被主动改变。日志仍缺最后一页，但返航坐标已经可用。',
  },
  'snow-recover-lantern-log': {
    name: '挑战第四处观测节点',
    description: '主线达成后可先锁定回报，再继续恢复最后一处观测记录，成功回归额外 +8 分。',
    returnText: '第四处记录补上了被删去的返航页码。',
  },
  'objective-secure-seventh-ring': {
    name: '稳定第七避难环',
    description: '建成临时避难所并守住两次界潮；主目标不依赖手动采集或随机事件。',
    returnText: '现场原始回执显示，登记为“已接回”的求援仍在等待救援。',
  },
  'objective-check-lamp-record': {
    name: '核查住户灯号',
    description: '在界锚稳定度不低于 65 时派一名队员调查，调查耗时 45 秒。',
    returnText: '灯号记录显示，被系统标记为空屋的街区仍有人持续发送求援信号。',
  },
  'objective-secure-household-page': {
    name: '保全户籍副页',
    description: '在界锚稳定度不低于 65 时派一名队员封存纸本，调查耗时 50 秒。',
    returnText: '副页比系统人口统计多出一栏住户；现场纸本只有成功回归后才会归档。',
  },
};

export const EVENT_COPY: Readonly<
  Record<
    string,
    {
      readonly title: string;
      readonly description: string;
      readonly options: Readonly<
        Record<string, { readonly label: string; readonly description: string }>
      >;
    }
  >
> = {
  'event-anchor-tower-failure': {
    title: '第七环锚塔失稳',
    description: '界潮冲击后锚塔结构松动。你需要在继续救援前决定如何处理界锚。',
    options: {
      'option-repair-main-anchor': {
        label: '优先抢修锚塔',
        description: '消耗 1 锚材，界锚稳定度恢复 10。',
      },
      'option-use-backup-anchor': {
        label: '启用备用锚',
        description: '消耗 1 能芯、回收 2 锚材，稳定度恢复 20。',
      },
    },
  },
  'event-unlit-house-call': {
    title: '空屋里的求援灯',
    description: '系统登记为无人居住的街区仍有灯光和能耗。异动只会出现在审计契约中。',
    options: {
      'option-send-auditor': {
        label: '派队核查',
        description: '花费 1 能芯、1 锚材并占用一名队员 45 秒，完成后可带回灯号记录。',
      },
      'option-salvage-cell': {
        label: '拆取电芯',
        description: '获得 6 能芯；放弃调查证据。',
      },
      'option-leave-lamp': { label: '保持现场', description: '不花费物资，本局放弃调查。' },
    },
  },
  'event-extra-household-page': {
    title: '多出的一页户籍',
    description: '现场纸本人口比任务终端多一栏住户，封存需要占用锚材与审计人力。',
    options: {
      'option-seal-paper-page': {
        label: '封存纸页',
        description: '花费 1 能芯、1 锚材并占用一名队员 50 秒，完成后带回副页。',
      },
      'option-salvage-anchor-pin': {
        label: '拆取锚钉',
        description: '获得 6 锚材；放弃户籍证据。',
      },
      'option-leave-household-page': {
        label: '暂不取证',
        description: '不花费物资，本局放弃调查。',
      },
    },
  },
  'river-bridge': {
    title: '河桥断裂',
    description: '桥下发现一条通往旧测绘站的路。队伍可以花费物资修桥，或绕路返回营地。',
    options: {
      'repair-crossing': { label: '修复河桥', description: '消耗物资，开放河岸测绘项目。' },
      'reinforce-marker': {
        label: '加固边界信标',
        description: '边界守卫契约专属方案，消耗木石并开放信标加固项目。',
      },
      'take-detour': { label: '绕路返回', description: '不花费物资，放弃本局测绘项目。' },
    },
  },
  'forest-fallen-cache': {
    title: '倒木下的补给箱',
    description: '箱内只剩木料和石料，队伍只能优先带走一种。',
    options: {
      'trade-stone-for-timber': {
        label: '拆石料换木料',
        description: '消耗 4 石，获得 8 木。',
      },
      'trade-timber-for-stone': {
        label: '拆木料换石料',
        description: '消耗 4 木，获得 8 石。',
      },
      'leave-cache': { label: '放弃翻找', description: '不花费物资，也不获得额外材料。' },
    },
  },
  'forest-signal-flare': {
    title: '熄灭的信号火堆',
    description: '残留物能拆成绳索或加固钉，选择眼下更缺的一种。',
    options: {
      'salvage-rope': { label: '整理绳索', description: '消耗 3 石，获得 6 木。' },
      'salvage-palisade-pins': { label: '拆取加固钉', description: '消耗 3 木，获得 6 石。' },
      'leave-signal-cache': { label: '不拆取残件', description: '不花费物资，也不获得额外材料。' },
    },
  },
  'ruins-fragile-depot': {
    title: '倾斜的旧仓库',
    description: '仓库结构即将坍塌，有限时间只够抢救一类材料。',
    options: {
      'recover-bronze-tools': { label: '抢救铜制工具', description: '消耗 5 木，获得 8 石。' },
      'recover-beams': { label: '抢救完好梁木', description: '消耗 5 石，获得 8 木。' },
      'leave-depot': { label: '撤出旧仓库', description: '不花费物资，也不获得额外材料。' },
    },
  },
  'ruins-echoing-gallery': {
    title: '回声长廊',
    description: '墙体松动，清理一侧会损耗另一侧的可用材料。',
    options: {
      'brace-the-gallery': { label: '支撑石廊', description: '消耗 4 木、2 石，获得 10 石。' },
      'clear-the-archway': { label: '打通木梁门洞', description: '消耗 2 木、4 石，获得 10 木。' },
      'leave-gallery': { label: '绕开长廊', description: '不花费物资，也不获得额外材料。' },
    },
  },
  'snow-buried-fuel-drum': {
    title: '雪下燃料桶',
    description: '燃料桶被压在金属构件下，拆解方向决定能带走的物资。',
    options: {
      'trade-stone-for-fuel': { label: '拆构件取燃料', description: '消耗 4 石，获得 6 木。' },
      'trade-fuel-for-parts': { label: '拆燃料桶取零件', description: '消耗 4 木，获得 6 石。' },
      'leave-fuel-drum': { label: '保留燃料桶原状', description: '不花费物资，也不获得额外材料。' },
    },
  },
  'snow-cracked-insulation': {
    title: '破损保温层',
    description: '修复材料不足，只能先补燃料侧或设备侧的缺口。',
    options: {
      'reuse-metal-sheets': { label: '回收金属覆板', description: '消耗 3 石，获得 5 木。' },
      'reinforce-thermal-joints': {
        label: '加固热交换接头',
        description: '消耗 3 木，获得 5 石。',
      },
      'leave-insulation': { label: '不拆保温层', description: '不花费物资，也不获得额外材料。' },
    },
  },
};

export const PROJECT_COPY: Readonly<
  Record<string, { readonly name: string; readonly description: string }>
> = {
  'project-check-vacant-house': {
    name: '空屋灯号复核',
    description:
      '一名队员离开生产与守备岗位 {duration}。完成后证据暂存于本局，只有成功回归才会写入救援回执库。',
  },
  'project-seal-household-page': {
    name: '户籍副页封存',
    description:
      '一名队员离开生产与守备岗位 {duration}。完成后副页暂存于本局，只有成功回归才会写入救援回执库。',
  },
  'river-survey': {
    name: '河岸旧道测绘',
    description:
      '一名队员离开生产与守备岗位 {duration}。完成后可带回临时测绘记录；只有成功回归才会转为永久线索。',
  },
  'relay-inspection': {
    name: '边界信标加固',
    description:
      '一名采石队员离开生产与守备岗位 {duration}。完成后可带回临时信标记录；只有成功回归才会转为永久线索。',
  },
};

export const WORKER_ROLE_COPY: Readonly<Record<WorkerRole, string>> = {
  wood: '能芯回收岗位',
  stone: '锚材回收岗位',
  guard: '环区守备岗位',
};

export const TASK_NAV_COPY = {
  pending: '有待处理的任务节点 · 前往处理 →',
  optional: '支线项目或调查已开放 · 查看任务 →',
} as const;

export const WORKER_COPY: Record<
  WorkerPresetId,
  { readonly name: string; readonly description: string }
> = {
  balanced: { name: '均衡应对', description: '生产与守备兼顾' },
  logging: { name: '能芯优先', description: '集中补充能芯' },
  mining: { name: '锚材优先', description: '集中补充锚材' },
  guard: { name: '全员守备', description: '停止人员采集，提高防御' },
};

export const STANCE_COPY: Record<
  StanceId,
  { readonly name: string; readonly description: string }
> = {
  balanced: { name: '标准作业', description: '保留标准产出和防御' },
  industry: { name: '提前压线', description: '提高自动产出，承受界潮时损失更多界锚稳定度' },
  fortified: { name: '加固防线', description: '降低产出，提升守备能力' },
};

export const RESOURCE_COPY: Record<string, { readonly name: string; readonly icon: string }> = {
  wood: { name: '能芯', icon: '⚡' },
  stone: { name: '锚材', icon: '⌖' },
  'resource-energy-cell': { name: '能芯', icon: '⚡' },
  'resource-anchor-material': { name: '锚材', icon: '⌖' },
};

export const BEACON_OPTIONS: Record<
  'salvage' | 'restore',
  { readonly label: string; readonly description: string }
> = {
  salvage: {
    label: '拆解烽火台',
    description: '立即获得木头和石头，补充眼下的建造预算。',
  },
  restore: {
    label: '修复烽火台',
    description: '消耗木石加固防线；成功回归时结算额外积分。',
  },
};
