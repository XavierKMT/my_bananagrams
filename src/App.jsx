import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Tile from './Tile';
import './App.css';

function App() {
  const [tiles, setTiles] = useState([]);
  const [bagTiles, setBagTiles] = useState([]);
  const [groups, setGroups] = useState(new Map()); // Map of tileId -> groupId
  const [detachedTileIds, setDetachedTileIds] = useState(new Set());
  const tileElementsRef = useRef(new Map());
  const tilesRef = useRef(tiles);
  const groupsRef = useRef(groups);
  const detachedTileIdsRef = useRef(detachedTileIds);
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

  const getTileSize = useCallback(() => (window.innerWidth <= 768 ? 50 : 60), []);

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

  const drawTiles = (count) => {
    if (bagTiles.length === 0) return;

    // Take tiles from bag
    const toDraw = Math.min(count, bagTiles.length);
    const drawn = bagTiles.slice(0, toDraw);
    const remaining = bagTiles.slice(toDraw);

    // Position them at bottom of screen in a row
    const newTiles = drawn.map((tile, idx) => ({
      ...tile,
      position: {
        x: 100 + (idx * 70),
        y: window.innerHeight - 200
      }
    }));

    setTiles([...tiles, ...newTiles]);
    setBagTiles(remaining);
  };

  const isAdjacent = useCallback((pos1, pos2, tileSize = 60) => {
    // Keep group detection aligned with the snap model: tileSize + 1px gap.
    const expectedDistance = tileSize + 1;
    const alignTolerance = 20;
    const distanceTolerance = 4;

    const dx = Math.abs(pos1.x - pos2.x);
    const dy = Math.abs(pos1.y - pos2.y);

    const horizontalNeighbor =
      dy <= alignTolerance &&
      Math.abs(dx - expectedDistance) <= distanceTolerance;

    const verticalNeighbor =
      dx <= alignTolerance &&
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

      const positionToUse = {
        x: session.currentAnchorPosition.x + deltaX,
        y: session.currentAnchorPosition.y + deltaY,
      };

      if (deltaX === 0 && deltaY === 0) return;
      // Calculate proposed positions for ALL tiles in the group
      const proposedPositions = new Map();
      session.movedTileIds.forEach((tileId) => {
        const currentPosition = session.currentPositions.get(tileId);
        proposedPositions.set(tileId, {
          x: currentPosition.x + deltaX,
          y: currentPosition.y + deltaY,
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
          const deltaX = snapPosition.x - session.currentAnchorPosition.x;
          const deltaY = snapPosition.y - session.currentAnchorPosition.y;

          session.currentAnchorPosition = snapPosition;

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
        let positionToUse = newPosition;
        const snapPosition = calculateSnapPosition(id, newPosition, prevTiles, tileSize);

        if (snapPosition) {
          positionToUse = snapPosition;
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
  }, [applyPositionToElement, calculateSnapPosition, checkCollision, formGroups, getTileSize, initializeDragSession]);

  const shuffle = () => {
    if (tiles.length === 0) return;

    const shuffled = tiles.map(tile => ({
      ...tile,
      position: {
        x: Math.random() * (window.innerWidth - 200) + 100,
        y: Math.random() * (window.innerHeight - 400) + 100
      }
    }));

    setTiles(shuffled);
    formGroups(shuffled);
  };

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

  // eslint-disable-next-line no-unused-vars
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

  useEffect(() => {
    initializeGame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="game-container">
      <div className="controls">
        <button className="btn" onClick={() => drawTiles(21)}>
          Draw 21 Tiles
        </button>
        <button className="btn" onClick={() => drawTiles(1)}>
          Draw 1 Tile
        </button>
        <button className="btn" onClick={shuffle}>
          Shuffle
        </button>
        <button className="btn" onClick={initializeGame}>
          New Game
        </button>

        <div className="bag-info">
          Tiles in bag: {bagTiles.length}
        </div>
        {/* <div>
          {words.map((word, idx) => (
            <div key={idx} className="word-info">
              {word.text} ({word.direction})
            </div>
          ))}
        </div> */}
      </div>

      <div className="hero-copy">
        <h1 className="game-title">BANANAGRAMS</h1>
        <div className="instructions">
          Draw tiles from the bag • Drag tiles to build your crossword
        </div>
      </div>

      <div className="play-area">
        {tiles.map(tile => (
          <Tile
            key={tile.id}
            tileId={tile.id}
            letter={tile.letter}
            position={tile.position}
            groupId={groups.get(tile.id)}
            borderSides={groupedBorderSides.get(tile.id)}
            onPositionChange={updateTilePosition}
            onUngroup={handleUngroupTile}
            onRegisterElement={registerTileElement}
          />
        ))}
      </div>
    </div>
  );
}

export default App;