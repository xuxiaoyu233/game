import type {
  ExpeditionCommand,
  ExpeditionDefinition,
  ExpeditionSummary,
  SaveBundle,
} from '../domain/expedition/types';
import {
  CLUE_COPY,
  DIALOGUE_COPY,
  STORY_CHAPTERS,
  STORY_PROLOGUE,
  STORY_SIDE_STORIES,
} from '../themes/story-copy-v13';
import type { StoryArchiveUiEntry } from './story-archive-types';
import { getResourceName } from './resource-copy';

interface StoryPanelsProps {
  readonly definition: ExpeditionDefinition;
  readonly state: SaveBundle;
  readonly summary: ExpeditionSummary;
  readonly busy: boolean;
  readonly onCommand: (command: ExpeditionCommand) => void;
  readonly storyArchiveEntries: readonly StoryArchiveUiEntry[];
  readonly view?: 'journey' | 'archive' | 'run';
}

export function StoryPanels({
  definition,
  state,
  summary,
  busy,
  onCommand,
  storyArchiveEntries,
  view = 'journey',
}: StoryPanelsProps) {
  const run = state.activeRun;
  const profile = state.profile;
  const runWorld = definition.worlds.find((world) => world.id === run?.worldId);
  const projectedClues = storyArchiveEntries.flatMap((entry) => {
    const clue = definition.story.clues.find((candidate) => candidate.id === entry.clueId);
    const copy = CLUE_COPY[entry.copyId];
    return clue === undefined || copy === undefined ? [] : [{ clue, copy }];
  });
  if (run !== null) {
    const returnClue = projectedClues.find(
      ({ clue }) =>
        clue.source === 'return' &&
        clue.worldId === run.worldId &&
        (clue.requiresContractId === undefined ||
          clue.requiresContractId === null ||
          clue.requiresContractId === run.contractId) &&
        !profile.discoveredClueIds.includes(clue.id),
    );
    const optionalClues = projectedClues.filter(
      ({ clue }) =>
        clue.source === 'investigate' &&
        clue.worldId === run.worldId &&
        !profile.discoveredClueIds.includes(clue.id),
    );
    if (returnClue === undefined && optionalClues.length === 0) return null;
    return (
      <section className="panel story-panel">
        <span className="eyebrow">任务记录 · 世界中的证据</span>
        {returnClue !== undefined && (
          <>
            <h2>{returnClue.copy.title}</h2>
            <p>完成基础任务并回归后，你可以带走这一段主线记录。</p>
          </>
        )}
        {optionalClues.map(({ clue, copy }) => {
          const recovered = run.recoveredClueIds.includes(clue.id);
          const available = summary.availableClueIds.includes(clue.id);
          const cost = summary.investigationCosts[clue.id] ?? clue.cost;
          const canAfford = run.resources.wood >= cost.wood && run.resources.stone >= cost.stone;
          return (
            <div className="investigation-row" key={clue.id}>
              <h3>支线 · {copy?.title}</h3>
              <p>
                {recovered
                  ? '证据已收集，成功回归后会存入主空间档案；本轮失败或放弃会丢失。'
                  : copy?.hint}
              </p>
              <button
                className="secondary full-width"
                aria-label={`调查${copy?.title ?? clue.id}`}
                disabled={busy || recovered || !available || !canAfford}
                onClick={() => onCommand({ kind: 'investigate', clueId: clue.id })}
              >
                {recovered
                  ? '已找到 · 等待回归'
                  : `调查 · ${getResourceName(runWorld, 'wood')} ${cost.wood} / ${getResourceName(runWorld, 'stone')} ${cost.stone}`}
              </button>
            </div>
          );
        })}
      </section>
    );
  }

  const chapterDone = (chapter: (typeof STORY_CHAPTERS)[number]): boolean =>
    chapter.requiredClueIds.every((id) => profile.discoveredClueIds.includes(id)) &&
    (chapter.alternativeClueIds === undefined ||
      chapter.alternativeClueIds.some((id) => profile.discoveredClueIds.includes(id)));
  const chaptersDone = STORY_CHAPTERS.filter(chapterDone).length;
  const currentChapter = STORY_CHAPTERS.find((chapter) => !chapterDone(chapter));
  const visibleSideStories = STORY_SIDE_STORIES.filter((story) =>
    story.requiredClueIds.some((id) => profile.discoveredClueIds.includes(id)),
  );
  return (
    <>
      {view !== 'archive' && (
        <section className="panel story-panel main-story">
          <span className="eyebrow">长期目标 · 查明被删除的求援者</span>
          <div className="section-title">
            <h2>{STORY_PROLOGUE.title}</h2>
            <span>
              {chaptersDone}/{STORY_CHAPTERS.length} 段主线
            </span>
          </div>
          <p>
            {profile.discoveredClueIds.length === 0
              ? STORY_PROLOGUE.premise
              : currentChapter !== undefined
                ? `接下来：${currentChapter.goal}。`
                : '现场证据已经进入救援回执库。接下来要查明，为什么名册会把仍在求援的人记录为已接回。'}
          </p>
          <div className="chapter-track">
            {STORY_CHAPTERS.map((chapter, index) => (
              <span key={chapter.id} className={chapterDone(chapter) ? 'chapter-done' : ''}>
                {index + 1}. {chapter.title}
              </span>
            ))}
          </div>
          {profile.discoveredClueIds.length === 0 && (
            <p className="story-next">{STORY_PROLOGUE.firstGoal}</p>
          )}
        </section>
      )}
      {view !== 'archive' &&
        visibleSideStories.map((story) => {
          const completed =
            story.requiredClueIds.every((id) => profile.discoveredClueIds.includes(id)) &&
            story.alternativeClueIds.some((id) => profile.discoveredClueIds.includes(id));
          return (
            <section className="panel story-panel side-story-panel" key={story.id}>
              <span className="eyebrow">支线记录 · {completed ? '已完成' : '待续'}</span>
              <h2>{story.title}</h2>
              <p>{completed ? '分支合同的回归证据已经归档。' : `支线目标：${story.goal}。`}</p>
            </section>
          );
        })}
      {view === 'journey' &&
        summary.pendingDialogueIds.map((dialogueId) => {
          const dialogue = definition.story.dialogues.find((item) => item.id === dialogueId);
          const copy = DIALOGUE_COPY[dialogueId];
          if (dialogue === undefined || copy === undefined) return null;
          return (
            <section className="panel event-panel story-dialogue" key={dialogueId}>
              <span className="eyebrow">
                {copy.context} · {copy.speaker}
              </span>
              <h2>{copy.title}</h2>
              <p>{copy.text}</p>
              {dialogue.options.map((option) => (
                <button
                  key={option.id}
                  className="event-option"
                  disabled={busy}
                  aria-label={copy.options[option.id]?.label ?? option.id}
                  onClick={() =>
                    onCommand({ kind: 'choose-dialogue', dialogueId, optionId: option.id })
                  }
                >
                  <strong>{copy.options[option.id]?.label}</strong>
                  <span>
                    {copy.options[option.id]?.description}
                    {option.nextRunBonus.wood > 0
                      ? ` ${getResourceName(definition.worlds[0], 'wood')} +${option.nextRunBonus.wood}。`
                      : ''}
                    {option.nextRunBonus.stone > 0
                      ? ` ${getResourceName(definition.worlds[0], 'stone')} +${option.nextRunBonus.stone}。`
                      : ''}
                  </span>
                </button>
              ))}
              <p>每段对话只选择一次；路线、补给和任务解锁会写入永久档案。</p>
            </section>
          );
        })}
      {view === 'archive' && (
        <details className="panel journal-panel" open>
          <summary>线索档案 · 已保留 {profile.discoveredClueIds.length} 条</summary>
          {projectedClues
            .filter(
              ({ clue }) =>
                clue.source !== 'dialogue' || profile.discoveredClueIds.includes(clue.id),
            )
            .map(({ clue, copy }) => {
              const discovered = profile.discoveredClueIds.includes(clue.id);
              return (
                <article
                  className={`journal-entry ${discovered ? '' : 'unseen-clue'}`}
                  key={clue.id}
                >
                  <h3>{discovered ? copy.title : '尚未带回的证据'}</h3>
                  <p>{discovered ? copy.description : copy.hint}</p>
                  {discovered && <small>{copy.source}</small>}
                </article>
              );
            })}
        </details>
      )}
    </>
  );
}
