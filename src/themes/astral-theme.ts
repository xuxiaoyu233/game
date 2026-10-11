import type { GameTheme } from './types';

export const ASTRAL_THEME: GameTheme = {
  id: 'theme-world-rescue-bureau-astral',
  title: '诸界救援局',
  worldName: '寰门总台',
  resourceName: '行动物资',
  resourceUnit: '份',
  tagline: '一份现场证据，可能改变下一次救援的方向。',
  colors: {
    background: '#141128',
    surface: '#211b39',
    surfaceRaised: '#2c244a',
    text: '#f4efff',
    muted: '#aaa0c4',
    accent: '#c8a5ff',
    accentSoft: '#3b2b58',
    border: '#44375f',
  },
  scene: { backgroundImage: null, variant: 'astral' },
  tools: {
    extractor: { name: '星尘收集器', description: '捕捉微小星尘，让观测站持续积累能量。' },
    processor: { name: '频谱解析台', description: '解析流光频谱，提高星尘的收集效率。' },
    drone: { name: '巡航探测器', description: '沿轨道巡航，从更远的星域带回星尘。' },
  },
  upgrades: {
    'hand-grip': { name: '引力手套', description: '稳定微型引力场，每次手动收集获得双倍星尘。' },
    'extractor-gears': { name: '聚尘透镜', description: '汇聚散落微光，让收集器产量翻倍。' },
    'assembly-line': { name: '光谱校准', description: '校准解析流程，让解析台产量提高 50%。' },
    'drone-calibration': { name: '导航调谐', description: '调谐巡航轨道，让探测器产量提高 50%。' },
  },
  tasks: {
    foothold: {
      name: '点亮信标',
      description: '累计收集 50 粒星尘并拥有 1 台收集器，点亮第一座信标。',
    },
    automation: {
      name: '轨道协作',
      description: '累计收集 500 粒星尘并拥有 1 台解析台，建立轨道协作网络。',
    },
    settlement: {
      name: '观测站成形',
      description: '累计收集 2500 粒星尘并拥有 1 台探测器，建成基础观测站。',
    },
  },
  events: {
    'supply-cache': {
      name: '漂流的信号舱',
      description: '远方漂来一枚信号舱。你可以回收残存星尘，也可以修复它的信号阵列。',
      options: {
        salvage: { name: '回收星尘', description: '立即获得 200 粒星尘。' },
        repair: { name: '修复阵列', description: '所有自动生产提高 10%。' },
      },
    },
  },
};
