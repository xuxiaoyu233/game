export const STORY_PROLOGUE = {
  title: '序章 · 失落航标',
  premise:
    '你在一座没有出口的中转站醒来。值守员“岑”交给你四名投影队员：他们可以采集、建设或守备。返航坐标已遗失，只有失序世界中的航标还在回应。',
  firstGoal: '前往迷雾森林，守住营地并带回第一段信号。',
};

export const FIRST_EXPEDITION_GUIDANCE =
  '岑：队员会自动采集木石。建成避难棚并守住前两波即可回归；手动采集只用于补足眼前缺口。';

export const STORY_CHAPTERS: readonly {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly requiredClueIds: readonly string[];
  readonly alternativeClueIds?: readonly string[];
}[] = [
  {
    id: 'awakening',
    title: '醒来',
    goal: '从森林带回第一段信号',
    requiredClueIds: ['forest-signal'],
  },
  {
    id: 'contradiction',
    title: '倒置的年代',
    goal: '从古城带回建站记录',
    requiredClueIds: ['ruins-record'],
  },
  {
    id: 'coordinate',
    title: '门后的坐标',
    goal: '与值守员一起解读两段记录',
    requiredClueIds: ['door-coordinate'],
  },
  {
    id: 'sequence-under-storm',
    title: '暴风雪中的次序',
    goal: '修复观测站，验证记录片段先后并带回航标记录',
    requiredClueIds: ['door-coordinate', 'snow-observatory-record'],
  },
];

export const STORY_SIDE_STORIES = [
  {
    id: 'downstream-expedition',
    title: '河流尽头',
    goal: '完成分支契约并带回观测站记录或救援名册',
    requiredClueIds: ['forest-river-record'],
    alternativeClueIds: ['ruins-observatory-record', 'ruins-relief-manifest'],
  },
] as const;

export const CLUE_COPY: Readonly<
  Record<
    string,
    {
      readonly title: string;
      readonly description: string;
      readonly source: string;
      readonly hint: string;
    }
  >
> = {
  'forest-signal': {
    title: '重复的返航信号',
    description:
      '营地稳住后，接收机收到一段重复呼号：“航标零号，等候返航。”信号来自森林外的一座旧城。',
    source: '迷雾森林 · 基础任务成功回归',
    hint: '建成避难棚，守住两波并成功回归。',
  },
  'forest-river-record': {
    title: '河道测绘册',
    description:
      '测绘册标记出一条不可能存在的河流：它穿过森林，却在地图上流向一座尚未建成的城市。页面边缘写着“回到主空间后再核对”。',
    source: '迷雾森林 · 河岸测绘项目',
    hint: '选择河桥事件中的修复方案，派出队员完成测绘，并成功回归。',
  },
  'forest-perimeter-record': {
    title: '森林边界的旧防线',
    description:
      '两段木石墙的编号属于一支不在任何名册中的远征队。墙外留下的脚印朝着森林深处，墙内却有返回营地的痕迹。',
    source: '迷雾森林 · 边界守卫契约成功回归',
    hint: '首次成功返航后接取边界守卫契约，建成两道墙并守住两波。',
  },
  'forest-relay-record': {
    title: '边界信标编号牌',
    description:
      '信标底座的编号与古城档案格式一致，但年份早了七年。编号牌背面刻着“不要同时点亮两座”。',
    source: '迷雾森林 · 边界信标加固项目',
    hint: '接取边界守卫契约，在河桥事件中选择加固信标并完成派队项目，成功回归。',
  },
  'river-coordinate': {
    title: '观测站坐标校准',
    description:
      '岑把测绘册叠在旧城图上，确认河流终点指向一座静止的观测站。坐标可以换成观测站挑战契约。',
    source: '主空间 · 追查倒流河道',
    hint: '带回河岸测绘册后，在岑的对话中选择追查河流坐标。',
  },
  'relief-route': {
    title: '失散者补给路线',
    description: '岑认出河岸留下的旧标记是撤离队伍的补给符号。路线可以换成古城救援补给契约。',
    source: '主空间 · 接通撤离补给线',
    hint: '带回河岸测绘册后，在岑的对话中选择保护撤离路线。',
  },
  'ruins-observatory-record': {
    title: '观测站逆行星图',
    description: '塔顶星图的指针朝向河流源头。地图记录的观测日期，比森林里那本测绘册早了七年。',
    source: '古城遗迹 · 观测站挑战契约成功回归',
    hint: '选择观测坐标分支，建造瞭望塔、守住三波怪潮并成功回归。',
  },
  'ruins-relief-manifest': {
    title: '撤离队伍物资名册',
    description:
      '名册最后一页记着营地的木材储备，却没有任何幸存者签收。岑确认这支队伍曾沿河流撤离。',
    source: '古城遗迹 · 救援补给契约成功回归',
    hint: '选择救援补给分支，建造两道墙和一座伐木场，守住两波并成功回归。',
  },
  'ruins-record': {
    title: '比森林更晚的旧城',
    description:
      '城门刻着航标站建立日期，却比森林里信号的日期晚了许多年。两处遗迹不可能属于同一条正常时间线。',
    source: '古城遗迹 · 基础任务成功回归',
    hint: '完成主空间回归对话，进入古城并成功回归。',
  },
  'snow-observatory-record': {
    title: '暴风雪观测日志',
    description:
      '三次记录并非同一座城市的年代，而是航标在不同环境下保存的先后片段。森林呼号先于古城建站，观测站的回波则来自尚未发生的返航。',
    source: '雪站 · 修复发电机并完成三处观测节点后成功回归',
    hint: '沿门后坐标进入雪站，修复发电机并完成三处观测节点。',
  },
  'snow-order': {
    title: '片段顺序记录',
    description:
      '岑把三段记录按环境压力重新排列。接下来要查明的不是哪座城最古老，而是谁在重排这些片段，以及一次完整返航要付出什么。',
    source: '主空间 · 雪站返航对话',
    hint: '带回暴风雪观测日志后，与岑核对记录顺序。',
  },
  'forest-inscription': {
    title: '烽火台下的残刻',
    description:
      '修复后露出的底座写着：“如读到此文，请不要相信第一次返航。”署名被划掉了一半，只剩一个“岑”字。',
    source: '迷雾森林 · 修复后调查',
    hint: '守住第一波、修复烽火台，再支付物资调查，并成功回归。',
  },
  'ruins-script': {
    title: '被删去的值守记录',
    description:
      '石碑的旧刻显示，航标曾主动重排世界的先后次序。记录最后一行被反复凿去：“值守员并非……”',
    source: '古城遗迹 · 调查石碑',
    hint: '守住第一波，支付木石解读石碑，再成功回归。',
  },
  'route-source': {
    title: '追踪路线',
    description: '你决定先追查信号源。岑开放古城坐标，并为每次远征准备额外石材。',
    source: '主空间 · 追查信号源',
    hint: '森林回归后选择追查。',
  },
  'route-rescue': {
    title: '救援路线',
    description: '你决定先寻找失散者。岑开放古城坐标，并为每次远征准备额外木材。',
    source: '主空间 · 援助幸存者',
    hint: '森林回归后选择救援。',
  },
  'door-coordinate': {
    title: '第一段返航坐标',
    description:
      '两段记录拼出的目的地是一座静止在暴风雪中的观测站。主空间的门亮起了第一格，但“岑”的身份仍未得到解释。',
    source: '主空间 · 解读森林与古城记录',
    hint: '带回两处基础记录，与岑完成对话。',
  },
  'time-loop-proof': {
    title: '航标重启的证据',
    description:
      '两处被隐藏的记录指向同一次重启：航标曾为救回某个人循环世界。岑承认，这不是你第一次经过这里。',
    source: '主空间 · 交叉核对两条支线证据',
    hint: '带回森林残刻与古城石碑，再交叉核对。',
  },
};

export const DIALOGUE_COPY: Readonly<
  Record<
    string,
    {
      readonly context: string;
      readonly speaker: string;
      readonly title: string;
      readonly text: string;
      readonly options: Readonly<
        Record<string, { readonly label: string; readonly description: string }>
      >;
    }
  >
> = {
  'keeper-debrief': {
    context: '首次返航 · 主线回应',
    speaker: '值守员 · 岑',
    title: '有人在另一端等待',
    text: '“这是旧城的呼号。我一直以为它已经熄灭了。营地一旦稳定，你也可以主动引出回响、提前迎战，带回更多航标能量；代价是更强的怪潮和更短的准备。现在，你想追查信号源，还是先为失散者准备物资？两条路都经过古城。”',
    options: {
      'trace-source': {
        label: '追查信号源',
        description: '留下追踪路线记录，后续每局获得石材补给。',
      },
      'help-stranded': {
        label: '优先援助幸存者',
        description: '先建立救援补给路线，后续每局获得木材；具体救援任务将在后续章节展开。',
      },
    },
  },
  'keeper-revelation': {
    context: '古城返航 · 主线回应',
    speaker: '值守员 · 岑',
    title: '一座不该存在的站',
    text: '“年代对不上，说明它们是同一次事故被切开的两个片段。坐标还缺下一段，但门已经回应了。下一次，你想沿坐标前进，还是先保留一份档案？”',
    options: {
      'follow-coordinate': {
        label: '沿返航坐标追查',
        description: '记录主线下一目标，后续远征增加石材补给。',
      },
      'retain-archive': {
        label: '保留事故档案',
        description: '记录主线下一目标，后续远征增加木材补给。',
      },
    },
  },
  'keeper-sideproof': {
    context: '隐藏证据 · 交叉核对',
    speaker: '值守员 · 岑',
    title: '你不是第一次归来',
    text: '你把残刻与石碑摆在桌上。岑沉默许久：“航标为了找回一个人，反复重启过这些片段。你带回的证据，终于没有在这一次被抹去。”',
    options: {
      'cross-check': { label: '核对两份证据', description: '留下重启证据，解开序章的隐藏线索。' },
    },
  },
  'keeper-river-review': {
    context: '河岸返航 · 支线回应',
    speaker: '值守员 · 岑',
    title: '河流通向哪里',
    text: '岑把测绘册压在古城地图上，河道在纸面上穿过了两个互相矛盾的年代。“我们得选一条线索继续。追查坐标会打开观测站挑战；沿途的物资标记则可能接回一支失散队伍。”',
    options: {
      'follow-river-coordinate': {
        label: '追查观测站坐标',
        description:
          '解锁古城观测站契约，并为之后的每次远征多准备石材；完成并回归后，还能返场接通补给线。',
      },
      'protect-evacuation-route': {
        label: '保护撤离补给线',
        description:
          '解锁古城救援补给契约，并为之后的每次远征多准备木材；完成并回归后，还能返场追查观测站。',
      },
    },
  },
  'keeper-snow-debrief': {
    context: '雪站返航 · 首卷回答',
    speaker: '值守员 · 岑',
    title: '先后并不等于年代',
    text: '“森林、古城和雪站的记录保存的是一次航标重启的先后顺序，不是文明从低到高的年表。下一步要找出是谁在选择片段，也要弄清完整返航的代价。”',
    options: {
      'preserve-sequence': {
        label: '归档片段顺序',
        description: '保存首卷答案，并留下关于操作者与返航代价的新问题。',
      },
    },
  },
};

export const SETTLEMENT_STORY_COPY = {
  failed: {
    title: '投影中断',
    text: '怪潮切断了本次连接。未锚定的临时物资和证据留在片段里；主空间已有的积分、能力与档案仍在。',
  },
  abandoned: {
    title: '主动撤离',
    text: '你主动结束了这次连接。未锚定成果不会带回；已经锁定的奖励与证据照常结算，旧档案不受影响。',
  },
  secured: {
    title: '锚点兑现',
    text: '额外挑战没有守住，但返航锚保住了已锁定的积分、目标与证据；这次失守不会抹掉已兑现成果。',
  },
  forestAfterRoute: {
    title: '森林返场记录',
    text: '岑没有再复述第一次收到的呼号。古城路线和补给偏好已经归档；这次契约决定你还能从森林带回什么。',
  },
  forestAfterRiverChoice: {
    title: '河岸返场记录',
    text: '河道坐标已有去向，岑把旧测绘册留在档案架上。本次返场的新发现仍需成功回归，才会成为永久记录。',
  },
  ruinsAfterRevelation: {
    title: '古城返场记录',
    text: '建站年代与第一段坐标已经归档。再次连接不会改写旧证据；本次契约决定新的经营目标和可带回的记录。',
  },
} as const;
