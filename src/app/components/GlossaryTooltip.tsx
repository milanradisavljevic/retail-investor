'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { getGlossaryTerm, type GlossaryTerm } from '@/lib/glossary';

interface GlossaryTooltipProps {
  term: string;
  children: ReactNode;
  className?: string;
}

const POPUP_MAX_WIDTH = 320;

export default function GlossaryTooltip({ term, children, className }: GlossaryTooltipProps) {
  const [entry, setEntry] = useState<GlossaryTerm | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isHoverDevice, setIsHoverDevice] = useState(false);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});

  const wrapperRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    void getGlossaryTerm(term).then((result) => {
      if (active) {
        setEntry(result);
      }
    });
    return () => {
      active = false;
    };
  }, [term]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const onChange = () => setIsHoverDevice(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setExpanded(false);
  }, []);

  const updatePopupPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(POPUP_MAX_WIDTH, viewportWidth - 16);
    const estimatedHeight = expanded ? 300 : 190;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const nextPlacement = spaceBelow < estimatedHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';

    const left = Math.max(8, Math.min(viewportWidth - width - 8, rect.left + rect.width / 2 - width / 2));
    const top =
      nextPlacement === 'top'
        ? Math.max(8, rect.top - estimatedHeight - 8)
        : Math.min(viewportHeight - estimatedHeight - 8, rect.bottom + 8);

    setPopupStyle({
      position: 'fixed',
      left,
      top,
      width,
      maxWidth: POPUP_MAX_WIDTH,
      zIndex: 80,
    });
  }, [expanded]);

  useEffect(() => {
    if (!open) return;
    updatePopupPosition();
    const onResize = () => updatePopupPosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, updatePopupPosition]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current && !wrapperRef.current.contains(target)) {
        close();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  const triggerClass = useMemo(
    () =>
      [
        'inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-navy-500 bg-navy-700/80',
        'text-[11px] font-semibold leading-none text-text-muted hover:border-navy-400 hover:text-text-secondary transition-colors',
      ].join(' '),
    []
  );

  if (!entry) {
    return <span className={className}>{children}</span>;
  }

  return (
    <span
      ref={wrapperRef}
      className={`inline-flex items-center gap-1 ${className ?? ''}`}
      onMouseEnter={() => {
        if (isHoverDevice) setOpen(true);
      }}
      onMouseLeave={() => {
        if (isHoverDevice) close();
      }}
    >
      <span>{children}</span>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Begriff erklären: ${entry.term_de}`}
        className={triggerClass}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        ?
      </button>

      {open && (
        <div
          style={popupStyle}
          className="z-50 rounded-xl border border-navy-600 bg-navy-700 p-3 shadow-2xl shadow-black/40"
          role="dialog"
          aria-live="polite"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2">
            <div className="text-sm font-semibold text-text-primary">{entry.term_de}</div>
            <div className="text-xs text-text-muted">({entry.term_en})</div>
          </div>

          <p className="text-sm text-text-secondary leading-relaxed">{entry.definition_short}</p>

          <button
            type="button"
            className="mt-2 text-xs text-accent-blue hover:text-accent-blue/80 transition-colors"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? 'Weniger anzeigen' : 'Mehr erfahren'}
          </button>

          {expanded && (
            <div className="mt-2 space-y-2 border-t border-navy-600 pt-2">
              <p className="text-sm text-text-secondary leading-relaxed">{entry.definition_long}</p>
              <p className="text-xs text-text-muted">
                <span className="font-medium text-text-secondary">Alltagsbild:</span> {entry.analogy}
              </p>
            </div>
          )}

        </div>
      )}
    </span>
  );
}
