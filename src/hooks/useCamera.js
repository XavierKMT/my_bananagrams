import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

export function useCamera({ playAreaRef, boardTileLimit }) {
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanningCamera, setIsPanningCamera] = useState(false);
  const cameraRef = useRef(camera);
  const activePointersRef = useRef(new Map());
  const cameraGestureRef = useRef({ mode: null });

  const getTileSize = useCallback(() => (window.innerWidth <= 768 ? 50 : 60), []);
  const clampScale = useCallback((value) => Math.min(1.5, Math.max(0.5, value)), []);
  const getBoardSize = useCallback(() => getTileSize() * boardTileLimit, [boardTileLimit, getTileSize]);

  const getPlayAreaRect = useCallback(() => {
    return playAreaRef.current?.getBoundingClientRect() || {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }, [playAreaRef]);

  const clampCameraToBoard = useCallback((nextCamera) => {
    const { width: viewportW, height: viewportH } = getPlayAreaRect();
    const boardSize = getBoardSize();
    const scaledBoardW = boardSize * nextCamera.scale;
    const scaledBoardH = boardSize * nextCamera.scale;

    let clampedX;
    let clampedY;

    if (scaledBoardW <= viewportW) {
      clampedX = (viewportW - scaledBoardW) / 2;
    } else {
      const minX = viewportW - scaledBoardW;
      clampedX = Math.min(0, Math.max(minX, nextCamera.x));
    }

    if (scaledBoardH <= viewportH) {
      clampedY = (viewportH - scaledBoardH) / 2;
    } else {
      const minY = viewportH - scaledBoardH;
      clampedY = Math.min(0, Math.max(minY, nextCamera.y));
    }

    return {
      x: clampedX,
      y: clampedY,
      scale: nextCamera.scale,
    };
  }, [getBoardSize, getPlayAreaRect]);

  const updateCamera = useCallback((nextCamera) => {
    const clampedCamera = clampCameraToBoard(nextCamera);
    cameraRef.current = clampedCamera;
    setCamera(clampedCamera);
  }, [clampCameraToBoard]);

  const centerCameraOnBoard = useCallback(() => {
    const { width: viewportW, height: viewportH } = getPlayAreaRect();
    const boardSize = getBoardSize();

    updateCamera({
      x: (viewportW - boardSize) / 2,
      y: (viewportH - boardSize) / 2,
      scale: 1,
    });
  }, [getBoardSize, getPlayAreaRect, updateCamera]);

  const screenToBoard = useCallback((clientX, clientY) => {
    const { left, top } = getPlayAreaRect();
    const { x, y, scale } = cameraRef.current;
    const localX = clientX - left;
    const localY = clientY - top;

    return {
      x: (localX - x) / scale,
      y: (localY - y) / scale,
    };
  }, [getPlayAreaRect]);

  const handlePlayAreaWheel = useCallback((event) => {
    event.preventDefault();

    const { left, top } = getPlayAreaRect();
    const localPoint = {
      x: event.clientX - left,
      y: event.clientY - top,
    };

    const currentCamera = cameraRef.current;
    const nextScale = clampScale(currentCamera.scale * Math.exp(-event.deltaY * 0.0015));
    if (nextScale === currentCamera.scale) return;

    const focalBoardPoint = {
      x: (localPoint.x - currentCamera.x) / currentCamera.scale,
      y: (localPoint.y - currentCamera.y) / currentCamera.scale,
    };

    updateCamera({
      x: localPoint.x - focalBoardPoint.x * nextScale,
      y: localPoint.y - focalBoardPoint.y * nextScale,
      scale: nextScale,
    });
  }, [clampScale, getPlayAreaRect, updateCamera]);

  const handlePlayAreaPointerDown = useCallback((event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('.tile')) return;

    const { left, top } = getPlayAreaRect();
    const localPoint = {
      x: event.clientX - left,
      y: event.clientY - top,
    };

    activePointersRef.current.set(event.pointerId, localPoint);
    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (event.pointerType === 'touch' && activePointersRef.current.size >= 2) {
      const [first, second] = Array.from(activePointersRef.current.values());
      const midpoint = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      };
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const currentCamera = cameraRef.current;

      cameraGestureRef.current = {
        mode: 'pinch',
        startDistance: distance,
        startScale: currentCamera.scale,
        focalBoardPoint: {
          x: (midpoint.x - currentCamera.x) / currentCamera.scale,
          y: (midpoint.y - currentCamera.y) / currentCamera.scale,
        },
      };
      setIsPanningCamera(true);
      return;
    }

    cameraGestureRef.current = {
      mode: 'pan',
      pointerId: event.pointerId,
      startPointer: localPoint,
      startCamera: { ...cameraRef.current },
    };
    setIsPanningCamera(true);
  }, [getPlayAreaRect]);

  const handlePlayAreaPointerMove = useCallback((event) => {
    if (!activePointersRef.current.has(event.pointerId)) return;

    const { left, top } = getPlayAreaRect();
    const localPoint = {
      x: event.clientX - left,
      y: event.clientY - top,
    };
    activePointersRef.current.set(event.pointerId, localPoint);

    const gesture = cameraGestureRef.current;
    if (!gesture.mode) return;

    if (gesture.mode === 'pan') {
      if (gesture.pointerId !== event.pointerId) return;

      const deltaX = localPoint.x - gesture.startPointer.x;
      const deltaY = localPoint.y - gesture.startPointer.y;

      updateCamera({
        x: gesture.startCamera.x + deltaX,
        y: gesture.startCamera.y + deltaY,
        scale: gesture.startCamera.scale,
      });
      return;
    }

    if (gesture.mode === 'pinch' && activePointersRef.current.size >= 2) {
      const [first, second] = Array.from(activePointersRef.current.values());
      const midpoint = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      };
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const nextDistance = Math.sqrt(dx * dx + dy * dy) || 1;
      const nextScale = clampScale(gesture.startScale * (nextDistance / gesture.startDistance));

      updateCamera({
        x: midpoint.x - gesture.focalBoardPoint.x * nextScale,
        y: midpoint.y - gesture.focalBoardPoint.y * nextScale,
        scale: nextScale,
      });
    }
  }, [clampScale, getPlayAreaRect, updateCamera]);

  const handlePlayAreaPointerUp = useCallback((event) => {
    activePointersRef.current.delete(event.pointerId);

    const remainingPointers = Array.from(activePointersRef.current.entries());
    const gesture = cameraGestureRef.current;

    if (gesture.mode === 'pinch' && remainingPointers.length === 1) {
      const [pointerId, point] = remainingPointers[0];
      cameraGestureRef.current = {
        mode: 'pan',
        pointerId,
        startPointer: point,
        startCamera: { ...cameraRef.current },
      };
      return;
    }

    if (gesture.mode === 'pan' && remainingPointers.length === 1) {
      const [pointerId, point] = remainingPointers[0];
      cameraGestureRef.current = {
        mode: 'pan',
        pointerId,
        startPointer: point,
        startCamera: { ...cameraRef.current },
      };
      return;
    }

    if (remainingPointers.length === 0) {
      cameraGestureRef.current = { mode: null };
      setIsPanningCamera(false);
    }
  }, []);

  const boardTransformStyle = useMemo(() => ({
    width: `${getBoardSize()}px`,
    height: `${getBoardSize()}px`,
    transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
  }), [camera, getBoardSize]);

  const resetView = useCallback((tiles) => {
    const { width: viewportW, height: viewportH } = getPlayAreaRect();

    if (tiles.length === 0) {
      centerCameraOnBoard();
      return;
    }

    const tileSize = getTileSize();
    const padding = 32;
    const minX = Math.min(...tiles.map((tile) => tile.position.x));
    const minY = Math.min(...tiles.map((tile) => tile.position.y));
    const maxX = Math.max(...tiles.map((tile) => tile.position.x + tileSize));
    const maxY = Math.max(...tiles.map((tile) => tile.position.y + tileSize));
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const fitScaleX = (viewportW - (padding * 2)) / contentWidth;
    const fitScaleY = (viewportH - (padding * 2)) / contentHeight;
    const fitScale = Math.min(clampScale(Math.min(fitScaleX, fitScaleY)), 1);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    updateCamera({
      x: (viewportW / 2) - (centerX * fitScale),
      y: (viewportH / 2) - (centerY * fitScale),
      scale: fitScale,
    });
  }, [centerCameraOnBoard, clampScale, getPlayAreaRect, getTileSize, updateCamera]);

  useEffect(() => {
    const handleResize = () => {
      updateCamera(cameraRef.current);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [updateCamera]);

  return {
    cameraRef,
    isPanningCamera,
    getTileSize,
    getBoardSize,
    getPlayAreaRect,
    centerCameraOnBoard,
    screenToBoard,
    handlePlayAreaWheel,
    handlePlayAreaPointerDown,
    handlePlayAreaPointerMove,
    handlePlayAreaPointerUp,
    boardTransformStyle,
    resetView,
    updateCamera,
  };
}
