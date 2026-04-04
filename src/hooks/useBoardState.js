import { useState, useEffect, useCallback, useRef } from 'react';
import { useGroups } from './useGroups';
import { useWordDetection } from './useWordDetection';

export function useBoardState({
  cameraRef,
  getTileSize,
  getBoardSize,
  getPlayAreaRect,
}) {
  const [tiles, setTiles] = useState([]);
  const [bagTiles, setBagTiles] = useState([]);
  const [useDictionary, setUseDictionary] = useState(false);
  const [dumpMode, setDumpMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notification, setNotification] = useState({
    message: '',
    visible: false,
    id: 0,
  });

  const tileElementsRef = useRef(new Map());
  const tilesRef = useRef(tiles);
  const dragSessionRef = useRef(null);
  const isDraggingAnyRef = useRef(false);

  const {
    groups,
    groupsRef,
    detachedTileIdsRef,
    setDetachedTileIds,
    formGroups,
    handleUngroupTile,
    groupedBorderSides,
    hasUngroupedTiles,
    resetGroupingState,
  } = useGroups({
    tiles,
    getTileSize,
    isDraggingAnyRef,
  });

  const { tileDictionaryState } = useWordDetection({
    tiles,
    groups,
    useDictionary,
    getTileSize,
  });

  const createSharedBagPlaceholders = useCallback((count) => {
    const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    return Array.from({ length: safeCount }, (_, index) => ({ id: `shared-bag-${index}`, letter: '' }));
  }, []);

  const placeTilesInVisibleRegion = useCallback((drawnTiles, existingTiles, options = {}) => {
    const horizontalSpawnPaddingRatio = Number(options?.horizontalSpawnPaddingRatio) || 0;
    const tileSize = getTileSize();
    const boardSize = getBoardSize();
    const margin = 50;
    const step = tileSize + 6;
    const { width: viewportW, height: viewportH } = getPlayAreaRect();
    const { x: cameraX, y: cameraY, scale: cameraScale } = cameraRef.current;
    const visibleLeft = (0 - cameraX) / cameraScale;
    const visibleTop = (0 - cameraY) / cameraScale;
    const visibleRight = (viewportW - cameraX) / cameraScale;
    const visibleBottom = (viewportH - cameraY) / cameraScale;

    const visibleWidth = Math.max(0, visibleRight - visibleLeft);
    const horizontalSpawnPadding = Math.max(0, visibleWidth * horizontalSpawnPaddingRatio);
    const minX = Math.max(0, visibleLeft + margin + horizontalSpawnPadding);
    const minY = Math.max(0, visibleTop + margin);
    const maxX = Math.min(
      boardSize - tileSize,
      visibleRight - margin - tileSize - horizontalSpawnPadding,
    );
    const maxY = Math.min(boardSize - tileSize, visibleBottom - margin - tileSize);

    const spawnMinX = maxX >= minX ? minX : Math.max(0, visibleLeft + margin);
    const spawnMaxX = maxX >= minX
      ? maxX
      : Math.min(boardSize - tileSize, visibleRight - margin - tileSize);

    const occupiedPositions = existingTiles.map((tile) => tile.position);
    const placedTiles = [];

    const isFree = (x, y) => {
      if (x < 0 || x + tileSize > boardSize) return false;
      if (y < 0 || y + tileSize > boardSize) return false;

      return !occupiedPositions.some((pos) => (
        Math.abs(pos.x - x) < tileSize - 2
        && Math.abs(pos.y - y) < tileSize - 2
      ));
    };

    drawnTiles.forEach((tile) => {
      let placed = false;

      for (let rowOffset = 0; !placed; rowOffset += 1) {
        const y = maxY - rowOffset * step;
        if (y < minY) break;

        for (let x = spawnMinX; x <= spawnMaxX; x += step) {
          if (isFree(x, y)) {
            const pos = { x, y };
            occupiedPositions.push(pos);
            placedTiles.push({ ...tile, position: pos });
            placed = true;
            break;
          }
        }
      }

      if (!placed) {
        const fallbackMax = Math.max(0, boardSize - tileSize);
        const pos = {
          x: Math.random() * fallbackMax,
          y: Math.random() * fallbackMax,
        };
        occupiedPositions.push(pos);
        placedTiles.push({ ...tile, position: pos });
      }
    });

    return placedTiles;
  }, [cameraRef, getBoardSize, getPlayAreaRect, getTileSize]);

  const showNotification = useCallback((message) => {
    if (!message) return;
    setNotification({
      message,
      visible: true,
      id: Date.now(),
    });
  }, []);

  const registerTileElement = useCallback((tileId, node) => {
    if (node) {
      tileElementsRef.current.set(tileId, node);
      return;
    }

    tileElementsRef.current.delete(tileId);
  }, []);

  const applyPositionToElement = useCallback((tileId, position) => {
    const element = tileElementsRef.current.get(tileId);
    if (!element) return;

    element.style.left = `${position.x}px`;
    element.style.top = `${position.y}px`;
  }, []);

  const initializeDragSession = useCallback((tileId) => {
    const currentTiles = tilesRef.current;
    const groupId = groupsRef.current.get(tileId);
    const movedTileIds = groupId === undefined
      ? [tileId]
      : currentTiles
        .filter((tile) => groupsRef.current.get(tile.id) === groupId)
        .map((tile) => tile.id);
    const movedTileIdSet = new Set(movedTileIds);
    const currentPositions = new Map();

    currentTiles.forEach((tile) => {
      if (movedTileIdSet.has(tile.id)) {
        currentPositions.set(tile.id, { ...tile.position });
      }
    });

    const anchorTile = currentTiles.find((tile) => tile.id === tileId);

    dragSessionRef.current = {
      tileId,
      movedTileIds,
      currentPositions,
      stationaryTiles: currentTiles.filter((tile) => !movedTileIdSet.has(tile.id)),
      currentAnchorPosition: anchorTile ? { ...anchorTile.position } : { x: 0, y: 0 },
    };

    isDraggingAnyRef.current = true;
  }, [groupsRef]);

  const checkCollision = useCallback((movedTilePositions, stationaryTiles, tileSize = 60) => {
    const collisionThreshold = tileSize * 0.6;
    const positions = movedTilePositions instanceof Map
      ? Array.from(movedTilePositions.values())
      : [movedTilePositions];

    return positions.some((movedPos) =>
      stationaryTiles.some((tile) => {
        const dx = Math.abs(movedPos.x - tile.position.x);
        const dy = Math.abs(movedPos.y - tile.position.y);
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < collisionThreshold;
      }));
  }, []);

  const calculateSnapPosition = useCallback((draggedTileId, draggedPos, tilesArray, tileSize = 60) => {
    const snapTolerance = tileSize + 20;
    const gap = 1;
    const snapThreshold = 20;
    const occupancyTolerance = 4;

    let closestSnap = null;
    let closestDistance = Infinity;

    const isOccupied = (candidatePosition) => tilesArray.some((tile) => (
      tile.id !== draggedTileId
      && Math.abs(tile.position.x - candidatePosition.x) <= occupancyTolerance
      && Math.abs(tile.position.y - candidatePosition.y) <= occupancyTolerance
    ));

    const considerSnap = (candidatePosition, distance) => {
      if (isOccupied(candidatePosition)) return;

      if (distance < closestDistance) {
        closestDistance = distance;
        closestSnap = candidatePosition;
      }
    };

    for (const tile of tilesArray) {
      if (tile.id === draggedTileId) continue;

      const dx = Math.abs(draggedPos.x - tile.position.x);
      const dy = Math.abs(draggedPos.y - tile.position.y);

      if (dy < snapThreshold && dx >= tileSize && dx <= snapTolerance) {
        if (draggedPos.x > tile.position.x) {
          const snapX = tile.position.x + tileSize + gap;
          considerSnap({ x: snapX, y: tile.position.y }, Math.abs(draggedPos.x - snapX));
        }

        if (draggedPos.x < tile.position.x) {
          const snapX = tile.position.x - tileSize - gap;
          considerSnap({ x: snapX, y: tile.position.y }, Math.abs(draggedPos.x - snapX));
        }
      }

      if (dx < snapThreshold && dy >= tileSize && dy <= snapTolerance) {
        if (draggedPos.y > tile.position.y) {
          const snapY = tile.position.y + tileSize + gap;
          considerSnap({ x: tile.position.x, y: snapY }, Math.abs(draggedPos.y - snapY));
        }

        if (draggedPos.y < tile.position.y) {
          const snapY = tile.position.y - tileSize - gap;
          considerSnap({ x: tile.position.x, y: snapY }, Math.abs(draggedPos.y - snapY));
        }
      }
    }

    return closestSnap;
  }, []);

  const updateTilePosition = useCallback((id, newPosition, isDragging) => {
    const tileSize = getTileSize();
    const boardSize = getBoardSize();
    const maxTileCoordinate = boardSize - tileSize;

    const clampPositionToBoard = (position) => ({
      x: Math.max(0, Math.min(maxTileCoordinate, position.x)),
      y: Math.max(0, Math.min(maxTileCoordinate, position.y)),
    });

    if (isDragging) {
      if (!dragSessionRef.current || dragSessionRef.current.tileId !== id) {
        initializeDragSession(id);
      }

      const session = dragSessionRef.current;
      if (!session) return;

      const rawDeltaX = newPosition.x - session.currentAnchorPosition.x;
      const rawDeltaY = newPosition.y - session.currentAnchorPosition.y;

      if (rawDeltaX === 0 && rawDeltaY === 0) return;

      const unsnappedPositions = new Map();
      session.movedTileIds.forEach((tileId) => {
        const currentPosition = session.currentPositions.get(tileId);
        unsnappedPositions.set(tileId, {
          x: currentPosition.x + rawDeltaX,
          y: currentPosition.y + rawDeltaY,
        });
      });

      let snapCorrection = null;
      let bestSnapDistance = Infinity;

      session.movedTileIds.forEach((tileId) => {
        const tileUnsnappedPos = unsnappedPositions.get(tileId);
        const tileSnapPos = calculateSnapPosition(tileId, tileUnsnappedPos, session.stationaryTiles, tileSize);

        if (!tileSnapPos) return;

        const correctionX = tileSnapPos.x - tileUnsnappedPos.x;
        const correctionY = tileSnapPos.y - tileUnsnappedPos.y;
        const snapDistance = Math.sqrt(correctionX * correctionX + correctionY * correctionY);

        if (snapDistance < bestSnapDistance) {
          bestSnapDistance = snapDistance;
          snapCorrection = { x: correctionX, y: correctionY };
        }
      });

      const deltaX = rawDeltaX + (snapCorrection ? snapCorrection.x : 0);
      const deltaY = rawDeltaY + (snapCorrection ? snapCorrection.y : 0);

      let boundedDeltaX = deltaX;
      let boundedDeltaY = deltaY;

      if (session.movedTileIds.length > 0) {
        const movedCurrentPositions = session.movedTileIds
          .map((tileId) => session.currentPositions.get(tileId))
          .filter(Boolean);

        if (movedCurrentPositions.length > 0) {
          const minX = Math.min(...movedCurrentPositions.map((pos) => pos.x));
          const minY = Math.min(...movedCurrentPositions.map((pos) => pos.y));
          const maxX = Math.max(...movedCurrentPositions.map((pos) => pos.x));
          const maxY = Math.max(...movedCurrentPositions.map((pos) => pos.y));

          const minDeltaX = -minX;
          const maxDeltaX = maxTileCoordinate - maxX;
          const minDeltaY = -minY;
          const maxDeltaY = maxTileCoordinate - maxY;

          boundedDeltaX = Math.max(minDeltaX, Math.min(maxDeltaX, boundedDeltaX));
          boundedDeltaY = Math.max(minDeltaY, Math.min(maxDeltaY, boundedDeltaY));
        }
      }

      const positionToUse = {
        x: session.currentAnchorPosition.x + boundedDeltaX,
        y: session.currentAnchorPosition.y + boundedDeltaY,
      };

      if (boundedDeltaX === 0 && boundedDeltaY === 0) return;

      const proposedPositions = new Map();
      session.movedTileIds.forEach((tileId) => {
        const currentPosition = session.currentPositions.get(tileId);
        proposedPositions.set(tileId, {
          x: currentPosition.x + boundedDeltaX,
          y: currentPosition.y + boundedDeltaY,
        });
      });

      if (checkCollision(proposedPositions, session.stationaryTiles, tileSize)) {
        return;
      }

      session.currentAnchorPosition = positionToUse;

      session.movedTileIds.forEach((tileId) => {
        const nextPosition = proposedPositions.get(tileId);
        session.currentPositions.set(tileId, nextPosition);
        applyPositionToElement(tileId, nextPosition);
      });

      return;
    }

    setTiles((prevTiles) => {
      const session = dragSessionRef.current && dragSessionRef.current.tileId === id
        ? dragSessionRef.current
        : null;
      let updatedTiles = prevTiles;

      if (session) {
        const snapPosition = calculateSnapPosition(
          id,
          session.currentAnchorPosition,
          session.stationaryTiles,
          tileSize,
        );

        if (snapPosition) {
          const boundedSnapPosition = clampPositionToBoard(snapPosition);
          const deltaX = boundedSnapPosition.x - session.currentAnchorPosition.x;
          const deltaY = boundedSnapPosition.y - session.currentAnchorPosition.y;

          session.currentAnchorPosition = boundedSnapPosition;

          session.movedTileIds.forEach((tileId) => {
            const currentPosition = session.currentPositions.get(tileId);
            session.currentPositions.set(tileId, {
              x: currentPosition.x + deltaX,
              y: currentPosition.y + deltaY,
            });
          });
        }

        updatedTiles = prevTiles.map((tile) => {
          const nextPosition = session.currentPositions.get(tile.id);
          return nextPosition ? { ...tile, position: nextPosition } : tile;
        });
      } else {
        let positionToUse = clampPositionToBoard(newPosition);
        const snapPosition = calculateSnapPosition(id, newPosition, prevTiles, tileSize);

        if (snapPosition) {
          positionToUse = clampPositionToBoard(snapPosition);
        }

        if (checkCollision(positionToUse, prevTiles.filter((tile) => tile.id !== id), tileSize)) {
          return prevTiles;
        }

        updatedTiles = prevTiles.map((tile) => (
          tile.id === id ? { ...tile, position: positionToUse } : tile
        ));
      }

      isDraggingAnyRef.current = false;
      dragSessionRef.current = null;

      let nextDetachedIds = detachedTileIdsRef.current;
      if (nextDetachedIds.has(id)) {
        nextDetachedIds = new Set(nextDetachedIds);
        nextDetachedIds.delete(id);
        detachedTileIdsRef.current = nextDetachedIds;
        setDetachedTileIds(nextDetachedIds);
      }

      formGroups(updatedTiles, nextDetachedIds);

      return updatedTiles;
    });
  }, [
    applyPositionToElement,
    calculateSnapPosition,
    checkCollision,
    detachedTileIdsRef,
    formGroups,
    getBoardSize,
    getTileSize,
    initializeDragSession,
    setDetachedTileIds,
  ]);

  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);

  useEffect(() => {
    if (!notification.visible) return undefined;

    const timeout = window.setTimeout(() => {
      setNotification((previous) => ({ ...previous, visible: false }));
    }, 3200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [notification.id, notification.visible]);

  useEffect(() => {
    if (dumpMode && !hasUngroupedTiles) {
      setDumpMode(false);
    }
  }, [dumpMode, hasUngroupedTiles]);

  return {
    tiles,
    setTiles,
    bagTiles,
    setBagTiles,
    useDictionary,
    setUseDictionary,
    dumpMode,
    setDumpMode,
    menuOpen,
    setMenuOpen,
    notification,
    showNotification,
    groups,
    detachedTileIdsRef,
    setDetachedTileIds,
    formGroups,
    handleUngroupTile,
    groupedBorderSides,
    hasUngroupedTiles,
    resetGroupingState,
    tileDictionaryState,
    createSharedBagPlaceholders,
    placeTilesInVisibleRegion,
    registerTileElement,
    updateTilePosition,
    tilesRef,
  };
}
