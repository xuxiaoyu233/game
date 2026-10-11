import type { GameTheme } from './types';

export const OUTPOST_THEME: GameTheme = {
  id: 'theme-world-rescue-bureau',
  title: '诸界救援局',
  worldName: '寰门总台',
  resourceName: '行动物资',
  resourceUnit: '份',
  tagline: '每一次回归，都为失籍者留下可复核的记录。',
  colors: {
    background: '#0b1320',
    surface: '#131f30',
    surfaceRaised: '#1c2b40',
    text: '#edf4ff',
    muted: '#98a9bf',
    accent: '#58dfb8',
    accentSoft: '#153f38',
    border: '#2a3a50',
  },
  scene: { backgroundImage: null, variant: 'outpost' },
  tools: {
    extractor: { name: '采集车', description: '驶向荒原，持续带回建设材料。' },
    processor: { name: '加工台', description: '整理采集物，提高前哨站的材料产出。' },
    drone: { name: '采集无人机', description: '深入远方，让采集网络覆盖更大范围。' },
  },
  upgrades: {
    'hand-grip': { name: '手工夹具', description: '改良手动工具，每次采集获得双倍材料。' },
    'extractor-gears': { name: '采集车齿轮', description: '更高效的传动结构，让采集车产量翻倍。' },
    'assembly-line': { name: '装配流程', description: '优化工序，让加工台产量提高 50%。' },
    'drone-calibration': {
      name: '无人机校准',
      description: '校准飞行路线，让无人机产量提高 50%。',
    },
  },
  tasks: {
    foothold: {
      name: '站稳脚跟',
      description: '累计采集 50 份材料并拥有 1 台采集车，领取启动补给。',
    },
    automation: {
      name: '自动运转',
      description: '累计采集 500 份材料并拥有 1 台加工台，扩展采集网络。',
    },
    settlement: {
      name: '前哨成形',
      description: '累计采集 2500 份材料并拥有 1 台无人机，建成基础前哨站。',
    },
  },
  events: {
    'supply-cache': {
      name: '遗址补给箱',
      description: '探索队找到一只旧补给箱。你可以回收物资，也可以修复其中的控制芯片。',
      options: {
        salvage: { name: '拆解箱体', description: '立即获得 200 份材料。' },
        repair: { name: '修复控制芯片', description: '所有自动生产提高 10%。' },
      },
    },
  },
};
