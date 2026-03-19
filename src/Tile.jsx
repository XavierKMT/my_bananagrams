import { useState, useRef, useEffect, memo } from 'react';
import PropTypes from 'prop-types';
import './Tile.css';

function Tile({ tileId, letter, position, onPositionChange, groupId, borderSides, onUngroup, onRegisterElement }) {
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const onPositionChangeRef = useRef(onPositionChange);
  const latestPositionRef = useRef(position);
  const pendingClientPointRef = useRef(null);
  const frameRef = useRef(null);
  const tileRef = useRef(null);

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

  // Unified handler for both mouse and touch
  const handleDragStart = (clientX, clientY, e) => {
    e.preventDefault();
    setIsDragging(true);

    const rect = tileRef.current.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    dragOffsetRef.current = { x: offsetX, y: offsetY };
  };

  const handleMouseDown = (e) => {
    handleDragStart(e.clientX, e.clientY, e);
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY, e);
  };

  useEffect(() => {
    if (!isDragging) return;

    const flushMove = () => {
      frameRef.current = null;
      const pendingPoint = pendingClientPointRef.current;
      if (!pendingPoint) return;

      const { x: clientX, y: clientY } = pendingPoint;
      const newX = clientX - dragOffsetRef.current.x;
      const newY = clientY - dragOffsetRef.current.y;
      const nextPosition = { x: newX, y: newY };
      onPositionChangeRef.current(tileId, nextPosition, true);
    };

    const scheduleMove = (clientX, clientY) => {
      pendingClientPointRef.current = { x: clientX, y: clientY };
      if (!frameRef.current) {
        frameRef.current = requestAnimationFrame(flushMove);
      }
    };

    const handleMouseMove = (e) => {
      scheduleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      scheduleMove(touch.clientX, touch.clientY);
    };

    const handleEnd = () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        flushMove();
      }

      setIsDragging(false);
      // Use the latest committed position to avoid post-drop drift.
      onPositionChangeRef.current(tileId, latestPositionRef.current, false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleEnd);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, tileId]);

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

  return (
    <div
      ref={tileRef}
      className={`tile ${isDragging ? 'dragging' : ''} ${groupId !== undefined ? 'grouped' : ''}`}
      style={style}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onDoubleClick={() => onUngroup(tileId)}
    >
      <div className={`tile-face ${groupId !== undefined ? borderClassName : ''}`}>
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
    prevProps.position.x === nextProps.position.x &&
    prevProps.position.y === nextProps.position.y &&
    prevBorders.top === nextBorders.top &&
    prevBorders.right === nextBorders.right &&
    prevBorders.bottom === nextBorders.bottom &&
    prevBorders.left === nextBorders.left &&
    prevProps.onPositionChange === nextProps.onPositionChange &&
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
  onUngroup: PropTypes.func.isRequired,
  onRegisterElement: PropTypes.func.isRequired,
};

export default memo(Tile, areEqual);