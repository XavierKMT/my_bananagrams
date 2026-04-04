import { useState, useCallback } from 'react';
import { TILE_DISTRIBUTION } from '../constants';

export function useSinglePlayerGame({
  tiles,
  setTiles,
  bagTiles,
  setBagTiles,
  setDumpMode,
  placeTilesInVisibleRegion,
  detachedTileIdsRef,
  setDetachedTileIds,
  formGroups,
  groups,
  showNotification,
  centerCameraOnBoard,
  resetGroupingState,
}) {
  const [singlePlayerWon, setSinglePlayerWon] = useState(false);
  const [singlePlayerGameType, setSinglePlayerGameType] = useState(null);
  const [singlePlayerTimerResetKey, setSinglePlayerTimerResetKey] = useState(0);

  const resetSinglePlayerState = useCallback(() => {
    setSinglePlayerWon(false);
    setSinglePlayerGameType(null);
    setSinglePlayerTimerResetKey((previousValue) => previousValue + 1);
  }, []);

  const initializeSinglePlayerGame = useCallback(() => {
    const allTiles = [];
    let id = 0;

    Object.entries(TILE_DISTRIBUTION).forEach(([letter, count]) => {
      for (let index = 0; index < count; index += 1) {
        allTiles.push({ id, letter });
        id += 1;
      }
    });

    for (let index = allTiles.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [allTiles[index], allTiles[swapIndex]] = [allTiles[swapIndex], allTiles[index]];
    }

    setBagTiles(allTiles);
    setTiles([]);
    resetSinglePlayerState();
    resetGroupingState();
    setDumpMode(false);
    centerCameraOnBoard();
  }, [centerCameraOnBoard, resetGroupingState, resetSinglePlayerState, setBagTiles, setDumpMode, setTiles]);

  const startSinglePlayerGame = useCallback((nextGameType) => {
    if (nextGameType !== 'short' && nextGameType !== 'long') {
      return;
    }

    const drawCount = Math.min(21, bagTiles.length);
    const drawnTiles = bagTiles.slice(0, drawCount);
    const remainingBagTiles = bagTiles.slice(drawCount);
    const placedTiles = placeTilesInVisibleRegion(drawnTiles, []);

    setSinglePlayerGameType(nextGameType);
    setSinglePlayerWon(false);
    setTiles(placedTiles);
    setBagTiles(remainingBagTiles);
    setDumpMode(false);
    formGroups(placedTiles, detachedTileIdsRef.current);
    setSinglePlayerTimerResetKey((previousValue) => previousValue + 1);
  }, [
    bagTiles,
    detachedTileIdsRef,
    formGroups,
    placeTilesInVisibleRegion,
    setBagTiles,
    setDumpMode,
    setTiles,
  ]);

  const drawSinglePlayerTiles = useCallback((count) => {
    if (bagTiles.length === 0) return;

    const drawCount = Math.min(count, bagTiles.length);
    const drawnTiles = bagTiles.slice(0, drawCount);
    const remainingBagTiles = bagTiles.slice(drawCount);
    const newTiles = placeTilesInVisibleRegion(drawnTiles, tiles);

    setTiles((previousTiles) => [...previousTiles, ...newTiles]);
    setBagTiles(remainingBagTiles);
  }, [bagTiles, placeTilesInVisibleRegion, setBagTiles, setTiles, tiles]);

  const handleSinglePlayerBananas = useCallback(() => {
    setSinglePlayerWon(true);
    showNotification('Bananas! You won!');
  }, [showNotification]);

  const handleSinglePlayerDump = useCallback((tileId) => {
    if (bagTiles.length < 3) return;
    if (groups.has(tileId)) return;

    const tileToDump = tiles.find((tile) => tile.id === tileId);
    if (!tileToDump) return;

    const remainingTiles = tiles.filter((tile) => tile.id !== tileId);
    const shuffledBag = [...bagTiles];

    for (let index = shuffledBag.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffledBag[index], shuffledBag[swapIndex]] = [shuffledBag[swapIndex], shuffledBag[index]];
    }

    const drawnTiles = shuffledBag.slice(0, 3);
    const remainingBagTiles = shuffledBag.slice(3);

    remainingBagTiles.push(tileToDump);

    for (let index = remainingBagTiles.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [remainingBagTiles[index], remainingBagTiles[swapIndex]] = [remainingBagTiles[swapIndex], remainingBagTiles[index]];
    }

    const replacementTiles = placeTilesInVisibleRegion(drawnTiles, remainingTiles);
    const updatedTiles = [...remainingTiles, ...replacementTiles];

    const nextDetachedIds = new Set(detachedTileIdsRef.current);
    nextDetachedIds.delete(tileId);

    setTiles(updatedTiles);
    setBagTiles(remainingBagTiles);
    setDetachedTileIds(nextDetachedIds);
    detachedTileIdsRef.current = nextDetachedIds;
    setDumpMode(false);
    formGroups(updatedTiles, nextDetachedIds);
  }, [
    bagTiles,
    detachedTileIdsRef,
    formGroups,
    groups,
    placeTilesInVisibleRegion,
    setBagTiles,
    setDetachedTileIds,
    setDumpMode,
    setTiles,
    tiles,
  ]);

  return {
    singlePlayerWon,
    singlePlayerGameType,
    singlePlayerTimerResetKey,
    resetSinglePlayerState,
    initializeSinglePlayerGame,
    startSinglePlayerGame,
    drawSinglePlayerTiles,
    handleSinglePlayerBananas,
    handleSinglePlayerDump,
  };
}
