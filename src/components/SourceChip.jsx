import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SourcePopover from './SourcePopover.jsx';
import './SourceChip.css';

const VIEWPORT_PADDING = 12;
const POPOVER_GAP = 10;
const DEFAULT_POPOVER_WIDTH = 380;
const DEFAULT_POPOVER_HEIGHT = 440;

function formatScore(score) {
  if (typeof score !== 'number') return '';
  return `${Math.round(score * 100)}% match`;
}

function scoreTone(score) {
  if (typeof score !== 'number') return 'unknown';
  if (score >= 0.82) return 'high';
  if (score >= 0.68) return 'medium';
  return 'low';
}

export default function SourceChip({ number, chunk, isCited = false, score }) {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({
    top: 0,
    left: 0,
    right: 'auto',
    bottom: 'auto',
    maxHeight: DEFAULT_POPOVER_HEIGHT,
    placement: 'bottom',
    visibility: 'hidden',
  });
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const popoverId = useId();

  if (!chunk) {
    return <span className="source-chip__fallback">[{number}]</span>;
  }

  const documentName = chunk.documentName || 'Untitled document';
  const scoreLabel = formatScore(score);
  const tone = scoreTone(score);

  const closePopover = useCallback(() => {
    setIsOpen(false);
  }, []);

  const togglePopover = useCallback(() => {
    setIsOpen((currentOpen) => !currentOpen);
  }, []);

  const updatePopoverPosition = useCallback(() => {
    if (!buttonRef.current || !popoverRef.current) {
      return;
    }

    const anchorRect = buttonRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popoverWidth = popoverRect.width || Math.min(DEFAULT_POPOVER_WIDTH, viewportWidth - (VIEWPORT_PADDING * 2));
    const popoverHeight = popoverRect.height || Math.min(DEFAULT_POPOVER_HEIGHT, viewportHeight - (VIEWPORT_PADDING * 2));

    if (viewportWidth <= 680) {
      const mobileMaxHeight = Math.min(520, Math.max(240, Math.floor(viewportHeight * 0.62)));
      setPopoverPosition({
        top: Math.max(VIEWPORT_PADDING, viewportHeight - 78 - mobileMaxHeight),
        left: VIEWPORT_PADDING,
        right: VIEWPORT_PADDING,
        bottom: 'auto',
        maxHeight: mobileMaxHeight,
        placement: 'bottom',
        visibility: 'visible',
      });
      return;
    }

    const spaceAbove = anchorRect.top - VIEWPORT_PADDING - POPOVER_GAP;
    const spaceBelow = viewportHeight - anchorRect.bottom - VIEWPORT_PADDING - POPOVER_GAP;
    const placement = spaceAbove >= popoverHeight || spaceAbove > spaceBelow ? 'top' : 'bottom';
    const preferredTop = placement === 'top'
      ? anchorRect.top - popoverHeight - POPOVER_GAP
      : anchorRect.bottom + POPOVER_GAP;
    const maxTop = Math.max(VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING - popoverHeight);
    const top = Math.min(Math.max(preferredTop, VIEWPORT_PADDING), maxTop);
    const preferredLeft = anchorRect.left + (anchorRect.width / 2) - (popoverWidth / 2);
    const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING - popoverWidth);
    const left = Math.min(Math.max(preferredLeft, VIEWPORT_PADDING), maxLeft);

    setPopoverPosition({
      top,
      left,
      right: 'auto',
      bottom: 'auto',
      maxHeight: Math.max(220, viewportHeight - (VIEWPORT_PADDING * 2)),
      placement,
      visibility: 'visible',
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    setPopoverPosition((currentPosition) => ({
      ...currentPosition,
      visibility: 'hidden',
    }));

    const frameId = requestAnimationFrame(updatePopoverPosition);
    return () => cancelAnimationFrame(frameId);
  }, [isOpen, updatePopoverPosition]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    let frameId = null;
    const requestPositionUpdate = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(updatePopoverPosition);
    };

    window.addEventListener('resize', requestPositionUpdate);
    document.addEventListener('scroll', requestPositionUpdate, true);

    return () => {
      window.removeEventListener('resize', requestPositionUpdate);
      document.removeEventListener('scroll', requestPositionUpdate, true);

      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [isOpen, updatePopoverPosition]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (
        wrapperRef.current?.contains(event.target)
        || popoverRef.current?.contains(event.target)
      ) {
        return;
      }

      closePopover();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [closePopover, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleDocumentKeyDown = (event) => {
      if (event.key === 'Escape') {
        closePopover();
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => document.removeEventListener('keydown', handleDocumentKeyDown);
  }, [closePopover, isOpen]);

  return (
    <span
      className="source-chip"
      ref={wrapperRef}
    >
      <button
        ref={buttonRef}
        className={[
          'source-chip__badge',
          `source-chip__badge--${tone}`,
          isCited ? 'is-cited' : 'is-uncited',
          isOpen ? 'is-open' : '',
        ].filter(Boolean).join(' ')}
        type="button"
        aria-label={[
          `Source ${number}: ${documentName}`,
          scoreLabel,
          isCited ? 'cited in this answer' : 'retrieved source',
        ].filter(Boolean).join(', ')}
        aria-describedby={isOpen ? popoverId : undefined}
        aria-controls={isOpen ? popoverId : undefined}
        aria-expanded={isOpen}
        onClick={togglePopover}
      >
        [{number}]
      </button>
      {isOpen && createPortal(
        <SourcePopover
          id={popoverId}
          ref={popoverRef}
          number={number}
          chunk={chunk}
          score={score}
          isCited={isCited}
          placement={popoverPosition.placement}
          style={{
            top: popoverPosition.top,
            left: popoverPosition.left,
            right: popoverPosition.right,
            bottom: popoverPosition.bottom,
            maxHeight: popoverPosition.maxHeight,
            visibility: popoverPosition.visibility,
          }}
          onClose={closePopover}
        />,
        document.body,
      )}
    </span>
  );
}
