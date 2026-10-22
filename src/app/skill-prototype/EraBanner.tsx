import { ERA_ORDER, eraRank, type EraId } from '../../domain/skill-loop/eras';
import { getEraDefinition } from '../../themes/eras';

export interface EraBannerProps {
  readonly eraId: EraId;
}

/**
 * The era is derived, never stored, so the banner is a read-only read of the same facts: it shows
 * the current era, how far the progression has come and what unlocks the next one. Rendering is a
 * single line, because the fixed top area has a strict height budget, and the full description
 * lives in the records tab. The entry animation is disabled under `prefers-reduced-motion`.
 */
export function EraBanner({ eraId }: EraBannerProps) {
  const era = getEraDefinition(eraId);
  const rank = eraRank(eraId);
  const nextId = ERA_ORDER[rank + 1];

  return (
    <span className="skill-prototype-era-banner" data-testid="era-banner" title={era.description}>
      <span className="skill-prototype-era-label">{era.label}</span>
      <span className="skill-prototype-era-track" aria-hidden="true">
        {ERA_ORDER.map((candidate, index) => (
          <span
            key={candidate}
            className={`skill-prototype-era-dot${index <= rank ? ' is-on' : ''}`}
          />
        ))}
      </span>
      {nextId === undefined ? (
        <span className="skill-prototype-era-next">已至最终时代</span>
      ) : (
        <span className="skill-prototype-era-next">下一时代 {getEraDefinition(nextId).label}</span>
      )}
    </span>
  );
}
