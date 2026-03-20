import { useState, useRef, useEffect, memo } from 'react';
import PropTypes from 'prop-types';
import './Tile.css';

function Tile({ tileId, letter, position, onPositionChange, groupId, borderSides, dictionaryState, onUngroup, onRegisterElement, screenToBoard, dumpMode, onDumpSelect }) {
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const onPositionChangeRef = useRef(onPositionChange);
  const latestPositionRef = useRef(position);
  const pendingClientPointRef = useRef(null);
  const frameRef = useRef(null);
  const tileRef = useRef(null);
  const longPressTimerRef = useRef(null);

  useEffect(() => {
    onPositionChangeRef.current = onPositionChange;
  }, [onPositionChange]);

  useEffect(() => {
    latestPositionRef.current = position;
  }, [position]);

  useEffect(() => {
    onRegisterElement(tileId, tileRef.current);

    return () => {
      onRegisterElement(tileId, null);
    };
  }, [tileId, onRegisterElement]);

  const handlePressStart = (clientX, clientY, e) => {
    e.preventDefault();
    e.stopPropagation();

    const pointerBoardStart = screenToBoard(clientX, clientY);
    dragOffsetRef.current = {
      x: pointerBoardStart.x - position.x,
      y: pointerBoardStart.y - position.y,
    };

    const pressStart = { x: clientX, y: clientY };
    let dragging = false;
    let didLongPress = false;

    const flushMove = () => {
      frameRef.current = null;
      const p = pendingClientPointRef.current;
      if (!p) return;

      const boardPoint = screenToBoard(p.x, p.y);
      onPositionChangeRef.current(tileId, {
        x: boardPoint.x - dragOffsetRef.current.x,
        y: boardPoint.y - dragOffsetRef.current.y,
      }, true);
    };

    const scheduleMove = (cx, cy) => {
      pendingClientPointRef.current = { x: cx, y: cy };
      if (!frameRef.current) {
        frameRef.current = requestAnimationFrame(flushMove);
      }
    };

    // Ungrouped tiles drag immediately; grouped tiles wait for movement or long press.
    if (groupId === undefined && !dumpMode) {
      dragging = true;
      setIsDragging(true);
    }

    let cleanup;

    if (groupId !== undefined) {
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        didLongPress = true;
        onUngroup(tileId);
      }, 500);
    }

    const onMove = (cx, cy) => {
      if (!dragging) {
        const dx = Math.abs(cx - pressStart.x);
        const dy = Math.abs(cy - pressStart.y);
        if (dx > 5 || dy > 5) {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          dragging = true;
          setIsDragging(true);
        }
      }
      if (dragging) scheduleMove(cx, cy);
    };

    const onEnd = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      cleanup();

      if (!dragging && !didLongPress && dumpMode) {
        onDumpSelect(tileId);
      }

      if (dragging) {
        if (frameRef.current) {
          cancelAnimationFrame(frameRef.current);
          flushMove();
          frameRef.current = null;
        }
        dragging = false;
        setIsDragging(false);
        // Use the latest committed position to avoid post-drop drift.
        onPositionChangeRef.current(tileId, latestPositionRef.current, false);
      }
    };

    const onMouseMove = (ev) => onMove(ev.clientX, ev.clientY);
    const onTouchMove = (ev) => {
      ev.preventDefault();
      onMove(ev.touches[0].clientX, ev.touches[0].clientY);
    };

    cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onEnd);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  const handleMouseDown = (e) => handlePressStart(e.clientX, e.clientY, e);
  const handleTouchStart = (e) => handlePressStart(e.touches[0].clientX, e.touches[0].clientY, e);

  const style = {
    left: `${position.x}px`,
    top: `${position.y}px`,
    cursor: isDragging ? 'grabbing' : 'grab',
    zIndex: isDragging ? 1000 : 1,
    transform: isDragging ? 'scale(1.05) rotate(2deg)' : 'scale(1)',
  };

  const activeBorders = borderSides || { top: true, right: true, bottom: true, left: true };
  const borderClassName = [
    activeBorders.top ? 'group-border-top' : '',
    activeBorders.right ? 'group-border-right' : '',
    activeBorders.bottom ? 'group-border-bottom' : '',
    activeBorders.left ? 'group-border-left' : '',
  ].filter(Boolean).join(' ');
  const dictionaryClassName = dictionaryState ? `dictionary-${dictionaryState}` : '';

  return (
    <div
      ref={tileRef}
      className={`tile ${isDragging ? 'dragging' : ''} ${groupId !== undefined ? 'grouped' : ''}`}
      style={style}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      <div className={`tile-face ${groupId !== undefined ? borderClassName : ''} ${dictionaryClassName}`.trim()}>
        <span className="tile-letter">{letter}</span>
      </div>
    </div>
  );
}

function areEqual(prevProps, nextProps) {
  const prevBorders = prevProps.borderSides || { top: true, right: true, bottom: true, left: true };
  const nextBorders = nextProps.borderSides || { top: true, right: true, bottom: true, left: true };

  return (
    prevProps.tileId === nextProps.tileId &&
    prevProps.letter === nextProps.letter &&
    prevProps.groupId === nextProps.groupId &&
    prevProps.dictionaryState === nextProps.dictionaryState &&
    prevProps.position.x === nextProps.position.x &&
    prevProps.position.y === nextProps.position.y &&
    prevBorders.top === nextBorders.top &&
    prevBorders.right === nextBorders.right &&
    prevBorders.bottom === nextBorders.bottom &&
    prevBorders.left === nextBorders.left &&
    prevProps.screenToBoard === nextProps.screenToBoard &&
    prevProps.dumpMode === nextProps.dumpMode &&
    prevProps.onPositionChange === nextProps.onPositionChange &&
    prevProps.onDumpSelect === nextProps.onDumpSelect &&
    prevProps.onUngroup === nextProps.onUngroup &&
    prevProps.onRegisterElement === nextProps.onRegisterElement
  );
}

Tile.propTypes = {
  tileId: PropTypes.number.isRequired,
  letter: PropTypes.string.isRequired,
  position: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
  }).isRequired,
  onPositionChange: PropTypes.func.isRequired,
  groupId: PropTypes.number,
  borderSides: PropTypes.shape({
    top: PropTypes.bool.isRequired,
    right: PropTypes.bool.isRequired,
    bottom: PropTypes.bool.isRequired,
    left: PropTypes.bool.isRequired,
  }),
  dictionaryState: PropTypes.oneOf(['valid', 'invalid']),
  screenToBoard: PropTypes.func.isRequired,
  dumpMode: PropTypes.bool,
  onDumpSelect: PropTypes.func,
  onUngroup: PropTypes.func.isRequired,
  onRegisterElement: PropTypes.func.isRequired,
};

export default memo(Tile, areEqual);