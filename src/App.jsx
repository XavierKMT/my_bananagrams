import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Tile from './Tile';
import dictionaryText from './dictionary.txt?raw';
import './App.css';

const BOARD_TILE_LIMIT = 100;

function App() {
  const [tiles, setTiles] = useState([]);
  const [bagTiles, setBagTiles] = useState([]);
  const [useDictionary, setUseDictionary] = useState(false);
  const [dumpMode, setDumpMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanningCamera, setIsPanningCamera] = useState(false);
  const [groups, setGroups] = useState(new Map()); // Map of tileId -> groupId
  const [detachedTileIds, setDetachedTileIds] = useState(new Set());
  const tileElementsRef = useRef(new Map());
  const playAreaRef = useRef(null);
  const tilesRef = useRef(tiles);
  const groupsRef = useRef(groups);
  const detachedTileIdsRef = useRef(detachedTileIds);
  const cameraRef = useRef(camera);
  const activePointersRef = useRef(new Map());
  const cameraGestureRef = useRef({ mode: null });
  const dragSessionRef = useRef(null);
  const isDraggingAnyRef = useRef(false);
  const cachedBorderSidesRef = useRef(new Map());

  // Bananagrams tile distribution
  const TILE_DISTRIBUTION = {
    A: 13, B: 3, C: 3, D: 6, E: 18, F: 3,
    G: 4, H: 3, I: 12, J: 2, K: 2, L: 5,
    M: 3, N: 8, O: 11, P: 3, Q: 2, R: 9,
    S: 6, T: 9, U: 6, V: 3, W: 3, X: 2,
    Y: 3, Z: 2
  };

  const initializeGame = () => {
    // Create all tiles
    const allTiles = [];
    let id = 0;

    Object.entries(TILE_DISTRIBUTION).forEach(([letter, count]) => {
      for (let i = 0; i < count; i++) {
        allTiles.push({ id: id++, letter });
      }
    });

    // Shuffle using Fisher-Yates algorithm
    for (let i = allTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allTiles[i], allTiles[j]] = [allTiles[j], allTiles[i]];
    }

    setBagTiles(allTiles);
    setTiles([]);
    setGroups(new Map());
    setDetachedTileIds(new Set());
    setDumpMode(false);
    centerCameraOnBoard();
  };

  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    detachedTileIdsRef.current = detachedTileIds;
  }, [detachedTileIds]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  const getTileSize = useCallback(() => (window.innerWidth <= 768 ? 50 : 60), []);
  const clampScale = useCallback((value) => Math.min(1.5, Math.max(0.5, value)), []);
  const getBoardSize = useCallback(() => getTileSize() * BOARD_TILE_LIMIT, [getTileSize]);

  const getPlayAreaRect = useCallback(() => {
    return playAreaRef.current?.getBoundingClientRect() || {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }, []);

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
  }, []);

  const placeTilesInVisibleRegion = useCallback((drawnTiles, existingTiles) => {
    const tileSize = getTileSize();
    const boardSize = getBoardSize();
    const margin = 10;
    const step = tileSize + 6; // grid step with a small gap between tiles
    const { width: viewportW, height: viewportH } = getPlayAreaRect();
    const { x: cameraX, y: cameraY, scale: cameraScale } = cameraRef.current;
    const visibleLeft = (0 - cameraX) / cameraScale;
    const visibleTop = (0 - cameraY) / cameraScale;
    const visibleRight = (viewportW - cameraX) / cameraScale;
    const visibleBottom = (viewportH - cameraY) / cameraScale;

    const minX = Math.max(0, visibleLeft + margin);
    const minY = Math.max(0, visibleTop + margin);
    const maxX = Math.min(boardSize - tileSize, visibleRight - margin - tileSize);
    const maxY = Math.min(boardSize - tileSize, visibleBottom - margin - tileSize);

    const occupiedPositions = existingTiles.map((tile) => tile.position);
    const placedTiles = [];

    const isFree = (x, y) => {
      if (x < 0 || x + tileSize > boardSize) return false;
      if (y < 0 || y + tileSize > boardSize) return false;

      return !occupiedPositions.some((pos) => (
        Math.abs(pos.x - x) < tileSize - 2 &&
        Math.abs(pos.y - y) < tileSize - 2
      ));
    };

    drawnTiles.forEach((tile) => {
      let placed = false;

      for (let rowOffset = 0; !placed; rowOffset++) {
        const y = maxY - rowOffset * step;
        if (y < minY) break;

        for (let x = minX; x <= maxX; x += step) {
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
  }, [getBoardSize, getPlayAreaRect, getTileSize]);

  const drawTiles = (count) => {
    if (bagTiles.length === 0) return;

    const toDraw = Math.min(count, bagTiles.length);
    const drawn = bagTiles.slice(0, toDraw);
    const remaining = bagTiles.slice(toDraw);
    const newTiles = placeTilesInVisibleRegion(drawn, tiles);

    setTiles((prev) => [...prev, ...newTiles]);
    setBagTiles(remaining);
  };

  const hasUngroupedTiles = useMemo(() => {
    return tiles.some((tile) => groups.get(tile.id) === undefined);
  }, [tiles, groups]);

  const handleDumpModeToggle = useCallback(() => {
    if (dumpMode) {
      setDumpMode(false);
      return;
    }

    if (bagTiles.length < 3) {
      return;
    }

    setDumpMode(true);
  }, [bagTiles.length, dumpMode]);

  const isAdjacent = useCallback((pos1, pos2, tileSize = 60) => {
    // Keep group detection aligned with the snap model: tileSize + 1px gap.
    const expectedDistance = tileSize + 1;
    const alignTolerance = 4;
    const distanceTolerance = 4;

    const dx = Math.abs(pos1.x - pos2.x);
    const dy = Math.abs(pos1.y - pos2.y);

    const horizontalNeighbor =
      dy <= alignTolerance &&
      dx >= tileSize &&
      Math.abs(dx - expectedDistance) <= distanceTolerance;

    const verticalNeighbor =
      dx <= alignTolerance &&
      dy >= tileSize &&
      Math.abs(dy - expectedDistance) <= distanceTolerance;

    return horizontalNeighbor || verticalNeighbor;
  }, []);

  const formGroups = useCallback((tilesArray, excludedIds = detachedTileIdsRef.current) => {
    const groupMap = new Map();
    let groupCounter = 0;
    const tileSize = getTileSize();

    for (let i = 0; i < tilesArray.length; i++) {
      if (excludedIds.has(tilesArray[i].id)) continue;

      // Skip if already assigned to a group
      if (groupMap.has(tilesArray[i].id)) continue;

      const groupId = groupCounter++;
      const queue = [tilesArray[i]];
      const visited = new Set([tilesArray[i].id]);
      const groupMembers = [];

      // BFS to find all connected tiles
      for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
        const current = queue[queueIndex];
        groupMembers.push(current.id);

        for (let j = 0; j < tilesArray.length; j++) {
          const other = tilesArray[j];
          if (
            !excludedIds.has(other.id) &&
            !visited.has(other.id) &&
            isAdjacent(current.position, other.position, tileSize)
          ) {
            visited.add(other.id);
            queue.push(other);
          }
        }
      }

      // Only assign group if it has 2 or more tiles
      if (groupMembers.length >= 2) {
        groupMembers.forEach(tileId => {
          groupMap.set(tileId, groupId);
        });
      }
    }

    setGroups(groupMap);
  }, [getTileSize, isAdjacent]);

  const handleDumpTileSelect = useCallback((tileId) => {
    if (!dumpMode) return;
    if (bagTiles.length < 3) return;
    if (groups.has(tileId)) return;

    const tileToDump = tiles.find((tile) => tile.id === tileId);
    if (!tileToDump) return;

    const remainingTiles = tiles.filter((tile) => tile.id !== tileId);
    const nextBag = [...bagTiles, tileToDump];

    for (let i = nextBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nextBag[i], nextBag[j]] = [nextBag[j], nextBag[i]];
    }

    const drawn = nextBag.slice(0, 3);
    const remainingBag = nextBag.slice(3);
    const replacementTiles = placeTilesInVisibleRegion(drawn, remainingTiles);
    const updatedTiles = [...remainingTiles, ...replacementTiles];

    const nextDetachedIds = new Set(detachedTileIdsRef.current);
    nextDetachedIds.delete(tileId);

    setTiles(updatedTiles);
    setBagTiles(remainingBag);
    setDetachedTileIds(nextDetachedIds);
    detachedTileIdsRef.current = nextDetachedIds;
    setDumpMode(false);
    formGroups(updatedTiles, nextDetachedIds);
  }, [bagTiles, dumpMode, formGroups, groups, placeTilesInVisibleRegion, tiles]);

  useEffect(() => {
    if (dumpMode && !hasUngroupedTiles) {
      setDumpMode(false);
    }
  }, [dumpMode, hasUngroupedTiles]);

  const checkCollision = useCallback((movedTilePositions, stationaryTiles, tileSize = 60) => {
    const collisionThreshold = tileSize * 0.6; // Tiles collide if centers closer than this

    // Handle both Map (for groups) and single position
    const positions = movedTilePositions instanceof Map 
      ? Array.from(movedTilePositions.values())
      : [movedTilePositions];

    // Check if ANY moved tile collides with ANY stationary tile
    return positions.some((movedPos) =>
      stationaryTiles.some((tile) => {
        const dx = Math.abs(movedPos.x - tile.position.x);
        const dy = Math.abs(movedPos.y - tile.position.y);
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < collisionThreshold;
      })
    );
  }, []);

  const calculateSnapPosition = useCallback((draggedTileId, draggedPos, tilesArray, tileSize = 60) => {
    const snapTolerance = tileSize + 20; // Detection range for snapping
    const gap = 1; // 1 pixel gap between tiles
    const snapThreshold = 20; // How close to the edge to trigger snap
    const occupancyTolerance = 4;

    let closestSnap = null;
    let closestDistance = Infinity;

    const isOccupied = (candidatePosition) => tilesArray.some((tile) => (
      tile.id !== draggedTileId &&
      Math.abs(tile.position.x - candidatePosition.x) <= occupancyTolerance &&
      Math.abs(tile.position.y - candidatePosition.y) <= occupancyTolerance
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

      // Check for horizontal adjacency (left or right)
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

      // Check for vertical adjacency (top or bottom)
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

      // Start from the user's intended drag delta.
      const unsnappedPositions = new Map();
      session.movedTileIds.forEach((tileId) => {
        const currentPosition = session.currentPositions.get(tileId);
        unsnappedPositions.set(tileId, {
          x: currentPosition.x + rawDeltaX,
          y: currentPosition.y + rawDeltaY,
        });
      });

      // Find the best snap correction based on where the group is being dragged to,
      // so dragging away naturally unsnaps.
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
      // Calculate proposed positions for ALL tiles in the group
      const proposedPositions = new Map();
      session.movedTileIds.forEach((tileId) => {
        const currentPosition = session.currentPositions.get(tileId);
        proposedPositions.set(tileId, {
          x: currentPosition.x + boundedDeltaX,
          y: currentPosition.y + boundedDeltaY,
        });
      });

      // Check collision with proposed positions BEFORE applying
      if (checkCollision(proposedPositions, session.stationaryTiles, tileSize)) {
        return; // Reject movement that would cause overlap
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

        // Check if placing single tile at this position causes collision
        if (checkCollision(positionToUse, prevTiles.filter((t) => t.id !== id), tileSize)) {
          // Reject placement and keep at current position
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
  }, [applyPositionToElement, calculateSnapPosition, checkCollision, formGroups, getBoardSize, getTileSize, initializeDragSession]);


  const handleUngroupTile = useCallback((id) => {
    if (!groups.has(id)) return;

    const nextDetachedIds = new Set(detachedTileIds);
    nextDetachedIds.add(id);
    setDetachedTileIds(nextDetachedIds);
    detachedTileIdsRef.current = nextDetachedIds;
    formGroups(tiles, nextDetachedIds);
  }, [groups, detachedTileIds, tiles, formGroups]);

  const groupedBorderSides = useMemo(() => {
    if (isDraggingAnyRef.current) {
      return cachedBorderSidesRef.current;
    }

    const sideMap = new Map();
    const tileSize = getTileSize();
    const expectedDistance = tileSize + 1; // 1px gap for snapped neighbors
    const alignTolerance = 20;
    const distanceTolerance = 4;

    tiles.forEach((tile) => {
      const groupId = groups.get(tile.id);
      if (groupId === undefined) return;

      const sides = { top: true, right: true, bottom: true, left: true };

      tiles.forEach((other) => {
        if (other.id === tile.id) return;
        if (groups.get(other.id) !== groupId) return;

        const dx = other.position.x - tile.position.x;
        const dy = other.position.y - tile.position.y;

        if (Math.abs(dy) <= alignTolerance && Math.abs(Math.abs(dx) - expectedDistance) <= distanceTolerance) {
          if (dx > 0) sides.right = false;
          if (dx < 0) sides.left = false;
        }

        if (Math.abs(dx) <= alignTolerance && Math.abs(Math.abs(dy) - expectedDistance) <= distanceTolerance) {
          if (dy > 0) sides.bottom = false;
          if (dy < 0) sides.top = false;
        }
      });

      sideMap.set(tile.id, sides);
    });

    cachedBorderSidesRef.current = sideMap;
    return sideMap;
  }, [tiles, groups, getTileSize]);

  const words = useMemo(() => {
    const tileSize = getTileSize();
    const expectedDistance = tileSize + 1;
    const alignTolerance = 20;
    const distanceTolerance = 4;
    const minWordLength = 2;

    const groupedTiles = new Map();

    tiles.forEach((tile) => {
      const groupId = groups.get(tile.id);
      if (groupId === undefined) return;

      if (!groupedTiles.has(groupId)) {
        groupedTiles.set(groupId, []);
      }

      groupedTiles.get(groupId).push(tile);
    });

    const findDirectionalNeighbor = (sourceTile, groupTiles, direction) => {
      let bestMatch = null;
      let bestScore = Infinity;

      groupTiles.forEach((candidate) => {
        if (candidate.id === sourceTile.id) return;

        const dx = candidate.position.x - sourceTile.position.x;
        const dy = candidate.position.y - sourceTile.position.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (direction === 'left' || direction === 'right') {
          const correctSide = direction === 'left' ? dx < 0 : dx > 0;
          if (!correctSide) return;
          if (absDy > alignTolerance) return;

          const distanceError = Math.abs(absDx - expectedDistance);
          if (distanceError > distanceTolerance) return;

          const score = distanceError + (absDy * 0.05);
          if (score < bestScore) {
            bestScore = score;
            bestMatch = candidate;
          }
          return;
        }

        const correctSide = direction === 'up' ? dy < 0 : dy > 0;
        if (!correctSide) return;
        if (absDx > alignTolerance) return;

        const distanceError = Math.abs(absDy - expectedDistance);
        if (distanceError > distanceTolerance) return;

        const score = distanceError + (absDx * 0.05);
        if (score < bestScore) {
          bestScore = score;
          bestMatch = candidate;
        }
      });

      return bestMatch;
    };

    const detectedWords = [];

    groupedTiles.forEach((groupTiles, groupId) => {
      groupTiles.forEach((startTile) => {
        const leftNeighbor = findDirectionalNeighbor(startTile, groupTiles, 'left');
        const rightNeighbor = findDirectionalNeighbor(startTile, groupTiles, 'right');

        if (!leftNeighbor && rightNeighbor) {
          const tileIds = [startTile.id];
          const letters = [startTile.letter];
          const seen = new Set([startTile.id]);
          let cursor = startTile;
          let canContinue = true;

          while (canContinue) {
            const next = findDirectionalNeighbor(cursor, groupTiles, 'right');
            if (!next || seen.has(next.id)) {
              canContinue = false;
              continue;
            }

            seen.add(next.id);
            tileIds.push(next.id);
            letters.push(next.letter);
            cursor = next;
          }

          if (tileIds.length >= minWordLength) {
            detectedWords.push({
              groupId,
              direction: 'horizontal',
              tileIds,
              text: letters.join(''),
            });
          }
        }

        const topNeighbor = findDirectionalNeighbor(startTile, groupTiles, 'up');
        const bottomNeighbor = findDirectionalNeighbor(startTile, groupTiles, 'down');

        if (!topNeighbor && bottomNeighbor) {
          const tileIds = [startTile.id];
          const letters = [startTile.letter];
          const seen = new Set([startTile.id]);
          let cursor = startTile;
          let canContinue = true;

          while (canContinue) {
            const next = findDirectionalNeighbor(cursor, groupTiles, 'down');
            if (!next || seen.has(next.id)) {
              canContinue = false;
              continue;
            }

            seen.add(next.id);
            tileIds.push(next.id);
            letters.push(next.letter);
            cursor = next;
          }

          if (tileIds.length >= minWordLength) {
            detectedWords.push({
              groupId,
              direction: 'vertical',
              tileIds,
              text: letters.join(''),
            });
          }
        }
      });
    });

    return detectedWords;
  }, [tiles, groups, getTileSize]);

  const dictionaryWords = useMemo(() => {
    return new Set(
      dictionaryText
        .split(/\r?\n/)
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean),
    );
  }, []);

  const tileDictionaryState = useMemo(() => {
    if (!useDictionary) {
      return new Map();
    }

    const stateByTileId = new Map();

    words.forEach((word) => {
      const isValid = dictionaryWords.has(word.text.toLowerCase());

      word.tileIds.forEach((tileId) => {
        const currentState = stateByTileId.get(tileId);

        if (!isValid) {
          if (currentState !== 'valid') {
            stateByTileId.set(tileId, 'invalid');
          }
          return;
        }

        stateByTileId.set(tileId, 'valid');
      });
    });

    return stateByTileId;
  }, [dictionaryWords, useDictionary, words]);

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

  const resetView = useCallback(() => {
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
  }, [centerCameraOnBoard, clampScale, getPlayAreaRect, getTileSize, tiles, updateCamera]);

  useEffect(() => {
    const handleResize = () => {
      updateCamera(cameraRef.current);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [updateCamera]);

  useEffect(() => {
    if (screen.orientation?.lock) {
      screen.orientation.lock('portrait').catch(() => {
        // Lock not supported or not in fullscreen — ignore
      });
    }
    initializeGame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="game-container">
      <div className="controls">
        <button
          className={`burger-btn${menuOpen ? ' open' : ''}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span />
          <span />
          <span />
        </button>

        <div className={`burger-menu${menuOpen ? ' open' : ''}`}>
          <button className="btn" onClick={() => { initializeGame(); setMenuOpen(false); }}>
            CLEAR
          </button>
          <button className="btn" onClick={() => { resetView(); setMenuOpen(false); }}>
            Fit to Tiles
          </button>
          <button className="btn" onClick={() => { drawTiles(21); setMenuOpen(false); }}>
            Draw 21 Tiles
          </button>
          <label className="dictionary-toggle">
            <input
              type="checkbox"
              checked={useDictionary}
              onChange={(event) => setUseDictionary(event.target.checked)}
            />
            <span>Use Dictionary</span>
          </label>
          <div className="bag-info">
            Tiles in bag: {bagTiles.length}
          </div>
        </div>

        <div className="controls-actions">
          {(hasUngroupedTiles || dumpMode) && (
            <button
              className={`btn ${dumpMode ? 'dump-mode-active' : ''}`.trim()}
              onClick={handleDumpModeToggle}
              disabled={bagTiles.length < 3}
            >
              {dumpMode ? 'Cancel Dump' : 'DUMP'}
            </button>
          )}
          {tiles.length > 0 &&
            bagTiles.length > 0 &&
            tiles.every((t) => groups.has(t.id)) &&
            new Set(groups.values()).size === 1 && (
              <button className="btn" onClick={() => drawTiles(1)}>
                PEEL
              </button>
            )}
        </div>
      </div>

      <div className="hero-copy">
        <h1 className="game-title">BANANAGRAMS</h1>
        <div className="instructions">
          Drag tiles to build your crossword • Long press to ungroup tiles
        </div>
      </div>

      <div
        ref={playAreaRef}
        className={`play-area ${isPanningCamera ? 'camera-panning' : ''}`}
        onWheel={handlePlayAreaWheel}
        onPointerDown={handlePlayAreaPointerDown}
        onPointerMove={handlePlayAreaPointerMove}
        onPointerUp={handlePlayAreaPointerUp}
        onPointerCancel={handlePlayAreaPointerUp}
      >
        <div className="board" style={boardTransformStyle}>
          {tiles.map(tile => (
            <Tile
              key={tile.id}
              tileId={tile.id}
              letter={tile.letter}
              position={tile.position}
              groupId={groups.get(tile.id)}
              borderSides={groupedBorderSides.get(tile.id)}
              dictionaryState={tileDictionaryState.get(tile.id)}
              onPositionChange={updateTilePosition}
              onUngroup={handleUngroupTile}
              onRegisterElement={registerTileElement}
              screenToBoard={screenToBoard}
              dumpMode={dumpMode}
              onDumpSelect={handleDumpTileSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;