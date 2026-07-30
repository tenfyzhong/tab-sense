import { useId } from 'react';

interface GuidedTourProps {
  body: string;
  className?: string;
  nextLabel?: string;
  onNext?: () => void | Promise<void>;
  onSkip: () => void | Promise<void>;
  skipLabel: string;
  stepLabel: string;
  title: string;
}

export function GuidedTour({
  body,
  className = '',
  nextLabel,
  onNext,
  onSkip,
  skipLabel,
  stepLabel,
  title,
}: GuidedTourProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <>
      <div aria-hidden="true" className="guided-tour-backdrop" />
      <aside
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="false"
        className={`guided-tour-popover ${className}`.trim()}
        role="dialog"
      >
        <div className="guided-tour-meta">
          <span>{stepLabel}</span>
          <button onClick={() => void onSkip()} type="button">
            {skipLabel}
          </button>
        </div>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{body}</p>
        {nextLabel && onNext && (
          <button className="guided-tour-next" onClick={() => void onNext()} type="button">
            {nextLabel}
            <span aria-hidden="true">→</span>
          </button>
        )}
      </aside>
    </>
  );
}
