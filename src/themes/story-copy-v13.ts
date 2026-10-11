export const STORY_PROLOGUE = {
  title: '第一卷 · 名册之外',
  premise:
    '诸界救援局的总台收到一份求援委托，系统却显示来源区域不存在、求援人已经接回。现场审计员闻照临指出，回执与城区里仍在闪烁的求援灯互相矛盾。',
  firstGoal: '前往失籍城·第七避难环，稳住界锚并带回未登记求援回执。',
};

export const FIRST_EXPEDITION_GUIDANCE =
  '调度员程远章：先建临时避难所，再守住两次界潮即可安全回归。能芯和锚材会自动生产；现场异动会停下来等你决定。';

export const STORY_CHAPTERS: readonly {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly requiredClueIds: readonly string[];
  readonly alternativeClueIds?: readonly string[];
}[] = [
  {
    id: 'seventh-ring-call',
    title: '第七环求援',
    goal: '带回系统已标记为“接回”的求援回执',
    requiredClueIds: ['clue-unlisted-rescue-receipt'],
  },
  {
    id: 'field-record-audit',
    title: '现场记录复核',
    goal: '核对住户灯号或户籍副页，并与总台审计员复核',
    requiredClueIds: ['clue-unlisted-rescue-receipt'],
    alternativeClueIds: ['clue-household-lamp-record', 'clue-missing-household-page'],
  },
];

export const STORY_SIDE_STORIES = [
  {
    id: 'unlisted-households',
    title: '被登记为空屋的街区',
    goal: '带回住户灯号记录，确认系统统计与现场是否一致',
    requiredClueIds: ['clue-unlisted-rescue-receipt'],
    alternativeClueIds: ['clue-household-lamp-record'],
  },
  {
    id: 'extra-ledger-page',
    title: '多出的一页户籍',
    goal: '保全现场副页，为第七环人口记录留下可复核原件',
    requiredClueIds: ['clue-unlisted-rescue-receipt'],
    alternativeClueIds: ['clue-missing-household-page'],
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
  'clue-unlisted-rescue-receipt': {
    title: '未登记求援回执',
    description:
      '总台的任务终端显示“已接回”，现场纸本却保留着仍在等待救援的签名栏。回执的来源区域在世界地图上没有坐标。',
    source: '失籍城·第七避难环 · 基础救援成功回归',
    hint: '建成临时避难所，守住两次界潮并成功回归。',
  },
  'clue-household-lamp-record': {
    title: '住户灯号记录',
    description:
      '被系统登记为空屋的街区，仍有多户灯号按固定间隔回应求援频段。灯号没有出现在救援名单的任何版本中。',
    source: '失籍城·第七避难环 · 空屋灯号复核项目',
    hint: '选择审计缺页街区契约，界锚稳定度达到门槛后派队调查，并成功回归。',
  },
  'clue-missing-household-page': {
    title: '缺页户籍副本',
    description:
      '现场纸本人口统计比总台终端多出一栏住户。装订孔和连续页码证明这不是后来补写的记录。',
    source: '失籍城·第七避难环 · 户籍副页封存项目',
    hint: '选择回收户籍副页契约，派队完成封存并成功回归。',
  },
  'clue-impossible-return-time': {
    title: '早于派遣的回归时间',
    description:
      '这份“已接回”的系统记录，完成时间早于救援局收到委托的时间。它只能证明记录顺序存在矛盾，暂时不能说明是谁改写了名册。',
    source: '寰门总台 · 回归复核对话',
    hint: '带回未登记求援回执后，与总台调度员完成复核。',
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
  'dialogue-return-audit': {
    context: '首次回归 · 回执复核',
    speaker: '程远章 · 寰门总台调度员',
    title: '系统记录先于派遣',
    text: '程远章把终端时间与现场纸本并排放好。闻照临指出两份记录无法同时为真。总台可以先按登记错误结案，也可以重新打开救援委托；目前没有证据说明是谁更改了名册。',
    options: {
      'option-file-as-registration-error': {
        label: '暂列登记误差',
        description: '先保存时间矛盾，下一次行动多带 6 锚材。',
      },
      'option-reopen-rescue-case': {
        label: '重开救援委托',
        description: '把现场求援重新排入行动队列，下一次行动多带 6 能芯。',
      },
    },
  },
};

export const SETTLEMENT_STORY_COPY = {
  failed: {
    title: '连接中断',
    text: '本次行动未能安全回归。未锚定的临时物资与现场证据留在失籍城；总台已归档的界点和回执不受影响。',
  },
  abandoned: {
    title: '主动撤离',
    text: '你结束了本次行动。未锚定的临时成果不会带回；已确认的永久成长和过往档案仍保留。',
  },
  secured: {
    title: '锚定成果已回收',
    text: '额外挑战没有完成，但已经确认的基础救援成果与回执已安全回到寰门总台。',
  },
  forestAfterRoute: {
    title: '返场记录',
    text: '总台已记录你对现场回执的处理方式。本次返场可以选择另一份契约，补齐不同的证据。',
  },
  forestAfterRiverChoice: {
    title: '现场审计已续办',
    text: '先前带回的纸本仍在档案库。本次行动中的新发现需要成功回归后才会入档。',
  },
  ruinsAfterRevelation: {
    title: '回执复核完成',
    text: '已带回的证据不会因返场而改写。调度员已开放新的行动条款和现场复核委托。',
  },
  worldAfterReturn: {
    title: '第七环回执已归档',
    text: '现场原始纸本与终端记录已分开保管。下次出发可以选择一份现场复核契约。',
  },
  worldAfterAudit: {
    title: '现场复核仍在继续',
    text: '闻照临确认，现场材料与总台回执存在可核验的差异。返场可以补做另一条记录，尚未查明的事实不会被提前写入档案。',
  },
} as const;
