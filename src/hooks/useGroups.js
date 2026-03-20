import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

export function useGroups({ tiles, getTileSize, isDraggingAnyRef }) {
  const [groups, setGroups] = useState(new Map());
  const [detachedTileIds, setDetachedTileIds] = useState(new Set());
  const groupsRef = useRef(groups);
  const detachedTileIdsRef = useRef(detachedTileIds);
  const cachedBorderSidesRef = useRef(new Map());

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    detachedTileIdsRef.current = detachedTileIds;
  }, [detachedTileIds]);

  const isAdjacent = useCallback((pos1, pos2, tileSize = 60) => {
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
      if (groupMap.has(tilesArray[i].id)) continue;

      const groupId = groupCounter++;
      const queue = [tilesArray[i]];
      const visited = new Set([tilesArray[i].id]);
      const groupMembers = [];

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

      if (groupMembers.length >= 2) {
        groupMembers.forEach((tileId) => {
          groupMap.set(tileId, groupId);
        });
      }
    }

    setGroups(groupMap);
  }, [getTileSize, isAdjacent]);

  const handleUngroupTile = useCallback((id) => {
    if (!groups.has(id)) return;

    const nextDetachedIds = new Set(detachedTileIdsRef.current);
    nextDetachedIds.add(id);
    setDetachedTileIds(nextDetachedIds);
    detachedTileIdsRef.current = nextDetachedIds;
    formGroups(tiles, nextDetachedIds);
  }, [formGroups, groups, tiles]);

  const groupedBorderSides = useMemo(() => {
    if (isDraggingAnyRef.current) {
      return cachedBorderSidesRef.current;
    }

    const sideMap = new Map();
    const tileSize = getTileSize();
    const expectedDistance = tileSize + 1;
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
  }, [getTileSize, groups, isDraggingAnyRef, tiles]);

  const hasUngroupedTiles = useMemo(() => {
    return tiles.some((tile) => groups.get(tile.id) === undefined);
  }, [groups, tiles]);

  const resetGroupingState = useCallback(() => {
    const emptyGroups = new Map();
    const emptyDetached = new Set();
    setGroups(emptyGroups);
    setDetachedTileIds(emptyDetached);
    groupsRef.current = emptyGroups;
    detachedTileIdsRef.current = emptyDetached;
  }, []);

  return {
    groups,
    groupsRef,
    detachedTileIds,
    detachedTileIdsRef,
    setDetachedTileIds,
    formGroups,
    handleUngroupTile,
    groupedBorderSides,
    hasUngroupedTiles,
    resetGroupingState,
  };
}
