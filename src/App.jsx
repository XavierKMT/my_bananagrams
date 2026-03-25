import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Users, Crown } from 'lucide-react';
import Tile from './Tile';
import Menu from './Menu';
import MultiplayerSetup from './MultiplayerSetup';
import Lobby from './Lobby';
import NotificationBanner from './NotificationBanner';
import './App.css';
import { BOARD_TILE_LIMIT, TILE_DISTRIBUTION } from './constants';
import { useCamera } from './hooks/useCamera';
import { useGroups } from './hooks/useGroups';
import { useWordDetection } from './hooks/useWordDetection';
import { useMultiplayer } from './hooks/useMultiplayer';

function App() {
  const [tiles, setTiles] = useState([]);
  const [bagTiles, setBagTiles] = useState([]);
  const [screen, setScreen] = useState('menu');
  const [gameMode, setGameMode] = useState(null);
  const [useDictionary, setUseDictionary] = useState(false);
  const [dumpMode, setDumpMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [multiplayerTabOpen, setMultiplayerTabOpen] = useState(false);
  const [spectatedPlayerIndex, setSpectatedPlayerIndex] = useState(0);
  const [multiplayerCountdown, setMultiplayerCountdown] = useState(null);
  const [multiplayerWinner, setMultiplayerWinner] = useState(null);
  const [singlePlayerWon, setSinglePlayerWon] = useState(false);
  const [playerBoardSnapshots, setPlayerBoardSnapshots] = useState(new Map());
  const [spectateCamera, setSpectateCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanningSpectateCamera, setIsPanningSpectateCamera] = useState(false);
  const [notification, setNotification] = useState({
    message: '',
    visible: false,
    id: 0,
  });

  const tileElementsRef = useRef(new Map());
  const playAreaRef = useRef(null);
  const spectatePlayAreaRef = useRef(null);
  const tilesRef = useRef(tiles);
  const dragSessionRef = useRef(null);
  const isDraggingAnyRef = useRef(false);
  const spectateCameraRef = useRef(spectateCamera);
  const spectateActivePointersRef = useRef(new Map());
  const spectateGestureRef = useRef({ mode: null });

  const {
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
  } = useCamera({ playAreaRef, boardTileLimit: BOARD_TILE_LIMIT });

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

  const initializeGame = useCallback(() => {
    const allTiles = [];
    let id = 0;

    Object.entries(TILE_DISTRIBUTION).forEach(([letter, count]) => {
      for (let i = 0; i < count; i++) {
        allTiles.push({ id: id++, letter });
      }
    });

    for (let i = allTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allTiles[i], allTiles[j]] = [allTiles[j], allTiles[i]];
    }

    setBagTiles(allTiles);
    setTiles([]);
    setSinglePlayerWon(false);
    resetGroupingState();
    setDumpMode(false);
    centerCameraOnBoard();
  }, [centerCameraOnBoard, resetGroupingState]);

  const handleEnterLobby = useCallback(() => {
    setGameMode('multiplayer');
    setScreen('lobby');
  }, []);

  const handleStartSinglePlayer = useCallback(() => {
    setGameMode('singlePlayer');
    initializeGame();
    setScreen('game');
  }, [initializeGame]);

  const handleMultiplayerReturnToMenu = useCallback(() => {
    setMultiplayerCountdown(null);
    setMultiplayerWinner(null);
    setSinglePlayerWon(false);
    setGameMode(null);
    setMultiplayerTabOpen(false);
    setScreen('menu');
  }, []);

  const handleCountdownStart = useCallback((seconds) => {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      setMultiplayerCountdown(null);
      return;
    }

    setMultiplayerCountdown(Math.ceil(seconds));
  }, []);

  const placeTilesInVisibleRegion = useCallback((drawnTiles, existingTiles) => {
    const tileSize = getTileSize();
    const boardSize = getBoardSize();
    const margin = 10;
    const step = tileSize + 6;
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
  }, [cameraRef, getBoardSize, getPlayAreaRect, getTileSize]);

  const handleMultiplayerDraw = useCallback((drawnTiles, remainingBagCount) => {
    const tilesToPlace = Array.isArray(drawnTiles) ? drawnTiles : [];

    if (tilesToPlace.length > 0) {
      setTiles((previousTiles) => [
        ...previousTiles,
        ...placeTilesInVisibleRegion(tilesToPlace, previousTiles),
      ]);
    }

    if (Number.isFinite(remainingBagCount)) {
      setBagTiles(createSharedBagPlaceholders(remainingBagCount));
    }
  }, [createSharedBagPlaceholders, placeTilesInVisibleRegion]);

  const handleMultiplayerDump = useCallback(({ removedTileId, drawnTiles, remainingBagCount }) => {
    if (!Number.isFinite(removedTileId)) {
      return;
    }

    const currentTiles = tilesRef.current;
    const remainingTiles = currentTiles.filter((tile) => tile.id !== removedTileId);
    const replacementTiles = Array.isArray(drawnTiles) && drawnTiles.length > 0
      ? placeTilesInVisibleRegion(drawnTiles, remainingTiles)
      : [];
    const updatedTiles = [...remainingTiles, ...replacementTiles];

    const nextDetachedIds = new Set(detachedTileIdsRef.current);
    nextDetachedIds.delete(removedTileId);

    setTiles(updatedTiles);
    setDetachedTileIds(nextDetachedIds);
    detachedTileIdsRef.current = nextDetachedIds;
    setDumpMode(false);
    formGroups(updatedTiles, nextDetachedIds);

    if (Number.isFinite(remainingBagCount)) {
      setBagTiles(createSharedBagPlaceholders(remainingBagCount));
    }
  }, [createSharedBagPlaceholders, detachedTileIdsRef, formGroups, placeTilesInVisibleRegion, setDetachedTileIds]);

  const handleBagCountUpdate = useCallback((remainingBagCount) => {
    if (!Number.isFinite(remainingBagCount)) return;
    setBagTiles(createSharedBagPlaceholders(remainingBagCount));
  }, [createSharedBagPlaceholders]);

  const handleMultiplayerGameStartWithData = useCallback((gameStartData) => {
    const initialTiles = Array.isArray(gameStartData?.initialTiles) ? gameStartData.initialTiles : [];
    const remainingBagCount = Number(gameStartData?.remainingBagCount);

    setMultiplayerCountdown(null);
    setGameMode('multiplayer');
    setSinglePlayerWon(false);
    resetGroupingState();
    setDumpMode(false);
    centerCameraOnBoard();

    const placedInitialTiles = initialTiles.length > 0
      ? placeTilesInVisibleRegion(initialTiles, [])
      : [];

    setTiles(placedInitialTiles);
    setBagTiles(
      createSharedBagPlaceholders(Number.isFinite(remainingBagCount) ? remainingBagCount : 0),
    );
    setScreen('game');
  }, [centerCameraOnBoard, createSharedBagPlaceholders, placeTilesInVisibleRegion, resetGroupingState]);

  const showNotification = useCallback((message) => {
    if (!message) return;
    setNotification({
      message,
      visible: true,
      id: Date.now(),
    });
  }, []);

  const handleWin = useCallback((message) => {
    if (!message) return;
    setMultiplayerWinner(message);
  }, []);

  const {
    multiplayerUsername,
    setMultiplayerUsername,
    multiplayerError,
    setMultiplayerError,
    roomCodeInput,
    setRoomCodeInput,
    roomCode,
    lobbyPlayers,
    isLobbyHost,
    currentPeerId,
    allPlayersReady,
    currentPlayerReady,
    createRoom,
    joinRoom,
    toggleReady,
    returnToLobby,
    startGame,
    requestMultiplayerDraw,
    requestMultiplayerDump,
    requestMultiplayerBananas,
    sendBoardSnapshot,
    leaveLobby,
  } = useMultiplayer({
    onEnterLobby: handleEnterLobby,
    onGameStart: handleMultiplayerGameStartWithData,
    onReturnToMenu: handleMultiplayerReturnToMenu,
    onNotify: showNotification,
    onWin: handleWin,
    onCountdownStart: handleCountdownStart,
    onMultiplayerDraw: handleMultiplayerDraw,
    onMultiplayerDump: handleMultiplayerDump,
    onBagCountUpdate: handleBagCountUpdate,
    onBoardSnapshot: (playerId, snapshot) => {
      setPlayerBoardSnapshots((prev) => {
        const next = new Map(prev);
        next.set(playerId, snapshot);
        return next;
      });
    },
  });

  const handleReturnToMenu = useCallback(() => {
    if (gameMode === 'multiplayer') {
      leaveLobby();
    }

    setGameMode(null);
    setMultiplayerCountdown(null);
    setMultiplayerWinner(null);
    setSinglePlayerWon(false);
    setMultiplayerTabOpen(false);
    setScreen('menu');
    setMenuOpen(false);
  }, [gameMode, leaveLobby]);

  const handleReturnToLobby = useCallback(() => {
    if (gameMode !== 'multiplayer') {
      return;
    }

    returnToLobby();
    setMenuOpen(false);
    setMultiplayerTabOpen(false);
    setScreen('lobby');
  }, [gameMode, returnToLobby]);

  useEffect(() => {
    const el = playAreaRef.current;
    if (!el) return undefined;
    el.addEventListener('wheel', handlePlayAreaWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handlePlayAreaWheel);
    };
  }, [screen, handlePlayAreaWheel, playAreaRef]);

  useEffect(() => {
    if (multiplayerCountdown === null) return undefined;
    if (multiplayerCountdown <= 0) {
      setMultiplayerCountdown(null);
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setMultiplayerCountdown((previous) => {
        if (previous === null) return null;
        return previous - 1;
      });
    }, 1000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [multiplayerCountdown]);

  useEffect(() => {
    if (!notification.visible) return undefined;

    const timeout = window.setTimeout(() => {
      setNotification((prev) => ({ ...prev, visible: false }));
    }, 3200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [notification.id, notification.visible]);

  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);

  useEffect(() => {
    if (gameMode !== 'multiplayer') {
      setMultiplayerTabOpen(false);
    }
  }, [gameMode]);

  // Send board snapshots when tiles change (multiplayer only)
  useEffect(() => {
    if (gameMode !== 'multiplayer') return;

    sendBoardSnapshot(tiles, getTileSize());
  }, [gameMode, tiles, sendBoardSnapshot, getTileSize]);

  const currentLobbyPlayer = lobbyPlayers.find((player) => player.id === currentPeerId) || null;
  const spectatablePlayers = lobbyPlayers.filter(
    (player) => player.id !== currentPeerId && player.status === 'In game',
  );
  const activeSpectatedPlayer = spectatablePlayers.length > 0
    ? spectatablePlayers[Math.min(spectatedPlayerIndex, spectatablePlayers.length - 1)]
    : null;
  const activeSpectatedSnapshot = activeSpectatedPlayer
    ? playerBoardSnapshots.get(activeSpectatedPlayer.id)
    : null;
  const activeSpectatedTiles = Array.isArray(activeSpectatedSnapshot?.tiles)
    ? activeSpectatedSnapshot.tiles
    : [];
  const spectatedMinX = activeSpectatedTiles.length > 0
    ? Math.min(...activeSpectatedTiles.map((tile) => Number(tile?.x) || 0))
    : 0;
  const spectatedMinY = activeSpectatedTiles.length > 0
    ? Math.min(...activeSpectatedTiles.map((tile) => Number(tile?.y) || 0))
    : 0;
  const spectateCoordinateScale = activeSpectatedSnapshot?.tileSize === 50 ? 0.8 : 0.667;
  const spectatePadding = 8;
  const spectateTileSize = Number(activeSpectatedSnapshot?.tileSize);
  const normalizedSpectateTileSize = Number.isFinite(spectateTileSize) ? spectateTileSize : 60;
  const normalizedSpectatedTiles = activeSpectatedTiles.map((tile) => ({
    ...tile,
    normalizedX: ((Number(tile?.x) || 0) - spectatedMinX) * spectateCoordinateScale + spectatePadding,
    normalizedY: ((Number(tile?.y) || 0) - spectatedMinY) * spectateCoordinateScale + spectatePadding,
  }));
  const spectatedBoardWidth = normalizedSpectatedTiles.length > 0
    ? Math.max(...normalizedSpectatedTiles.map((tile) => tile.normalizedX))
    + (normalizedSpectateTileSize * spectateCoordinateScale)
    + spectatePadding
    : 0;
  const spectatedBoardHeight = normalizedSpectatedTiles.length > 0
    ? Math.max(...normalizedSpectatedTiles.map((tile) => tile.normalizedY))
    + (normalizedSpectateTileSize * spectateCoordinateScale)
    + spectatePadding
    : 0;

  const clampSpectateScale = useCallback((value) => Math.min(1.8, Math.max(0.5, value)), []);

  const clampSpectateCameraToBoard = useCallback((nextCamera) => {
    const viewport = spectatePlayAreaRef.current?.getBoundingClientRect();
    const viewportWidth = viewport?.width || 0;
    const viewportHeight = viewport?.height || 0;

    if (viewportWidth <= 0 || viewportHeight <= 0 || spectatedBoardWidth <= 0 || spectatedBoardHeight <= 0) {
      return { x: 0, y: 0, scale: clampSpectateScale(nextCamera.scale || 1) };
    }

    const scale = clampSpectateScale(nextCamera.scale || 1);
    const scaledBoardWidth = spectatedBoardWidth * scale;
    const scaledBoardHeight = spectatedBoardHeight * scale;

    let clampedX;
    let clampedY;

    if (scaledBoardWidth <= viewportWidth) {
      clampedX = (viewportWidth - scaledBoardWidth) / 2;
    } else {
      const minX = viewportWidth - scaledBoardWidth;
      clampedX = Math.min(0, Math.max(minX, nextCamera.x));
    }

    if (scaledBoardHeight <= viewportHeight) {
      clampedY = (viewportHeight - scaledBoardHeight) / 2;
    } else {
      const minY = viewportHeight - scaledBoardHeight;
      clampedY = Math.min(0, Math.max(minY, nextCamera.y));
    }

    return {
      x: clampedX,
      y: clampedY,
      scale,
    };
  }, [clampSpectateScale, spectatedBoardHeight, spectatedBoardWidth]);

  const updateSpectateCamera = useCallback((nextCamera) => {
    const clampedCamera = clampSpectateCameraToBoard(nextCamera);
    spectateCameraRef.current = clampedCamera;
    setSpectateCamera(clampedCamera);
  }, [clampSpectateCameraToBoard]);

  const fitSpectateCameraToBoard = useCallback(() => {
    const viewport = spectatePlayAreaRef.current?.getBoundingClientRect();
    const viewportWidth = viewport?.width || 0;
    const viewportHeight = viewport?.height || 0;

    if (viewportWidth <= 0 || viewportHeight <= 0 || spectatedBoardWidth <= 0 || spectatedBoardHeight <= 0) {
      updateSpectateCamera({ x: 0, y: 0, scale: 1 });
      return;
    }

    const fitScale = clampSpectateScale(Math.min(
      viewportWidth / spectatedBoardWidth,
      viewportHeight / spectatedBoardHeight,
      1,
    ));

    const x = (viewportWidth - (spectatedBoardWidth * fitScale)) / 2;
    const y = (viewportHeight - (spectatedBoardHeight * fitScale)) / 2;

    updateSpectateCamera({ x, y, scale: fitScale });
  }, [clampSpectateScale, spectatedBoardHeight, spectatedBoardWidth, updateSpectateCamera]);

  const handleSpectateWheel = useCallback((event) => {
    event.preventDefault();

    const rect = spectatePlayAreaRef.current?.getBoundingClientRect();
    if (!rect) return;

    const localPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    const currentCamera = spectateCameraRef.current;
    const nextScale = clampSpectateScale(currentCamera.scale * Math.exp(-event.deltaY * 0.0015));
    if (nextScale === currentCamera.scale) return;

    const focalBoardPoint = {
      x: (localPoint.x - currentCamera.x) / currentCamera.scale,
      y: (localPoint.y - currentCamera.y) / currentCamera.scale,
    };

    updateSpectateCamera({
      x: localPoint.x - (focalBoardPoint.x * nextScale),
      y: localPoint.y - (focalBoardPoint.y * nextScale),
      scale: nextScale,
    });
  }, [clampSpectateScale, updateSpectateCamera]);

  const handleSpectatePointerDown = useCallback((event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const rect = spectatePlayAreaRef.current?.getBoundingClientRect();
    const localPoint = {
      x: event.clientX - (rect?.left || 0),
      y: event.clientY - (rect?.top || 0),
    };

    spectateActivePointersRef.current.set(event.pointerId, localPoint);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (event.pointerType === 'touch' && spectateActivePointersRef.current.size >= 2) {
      const [first, second] = Array.from(spectateActivePointersRef.current.values());
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const currentCamera = spectateCameraRef.current;

      spectateGestureRef.current = {
        mode: 'pinch',
        startDistance: distance,
        startScale: currentCamera.scale,
        focalBoardPoint: {
          x: (midpoint.x - currentCamera.x) / currentCamera.scale,
          y: (midpoint.y - currentCamera.y) / currentCamera.scale,
        },
      };
      setIsPanningSpectateCamera(true);
      return;
    }

    spectateGestureRef.current = {
      mode: 'pan',
      pointerId: event.pointerId,
      startPointer: localPoint,
      startCamera: { ...spectateCameraRef.current },
    };
    setIsPanningSpectateCamera(true);
  }, []);

  const handleSpectatePointerMove = useCallback((event) => {
    if (!spectateActivePointersRef.current.has(event.pointerId)) return;

    const rect = spectatePlayAreaRef.current?.getBoundingClientRect();
    const localPoint = {
      x: event.clientX - (rect?.left || 0),
      y: event.clientY - (rect?.top || 0),
    };
    spectateActivePointersRef.current.set(event.pointerId, localPoint);

    const gesture = spectateGestureRef.current;
    if (!gesture.mode) return;

    if (gesture.mode === 'pan') {
      if (gesture.pointerId !== event.pointerId) return;
      const deltaX = localPoint.x - gesture.startPointer.x;
      const deltaY = localPoint.y - gesture.startPointer.y;
      updateSpectateCamera({
        x: gesture.startCamera.x + deltaX,
        y: gesture.startCamera.y + deltaY,
        scale: gesture.startCamera.scale,
      });
      return;
    }

    if (gesture.mode === 'pinch' && spectateActivePointersRef.current.size >= 2) {
      const [first, second] = Array.from(spectateActivePointersRef.current.values());
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const nextDistance = Math.sqrt(dx * dx + dy * dy) || 1;
      const nextScale = clampSpectateScale(gesture.startScale * (nextDistance / gesture.startDistance));

      updateSpectateCamera({
        x: midpoint.x - gesture.focalBoardPoint.x * nextScale,
        y: midpoint.y - gesture.focalBoardPoint.y * nextScale,
        scale: nextScale,
      });
    }
  }, [clampSpectateScale, updateSpectateCamera]);

  const handleSpectatePointerUp = useCallback((event) => {
    spectateActivePointersRef.current.delete(event.pointerId);

    if (spectateActivePointersRef.current.size === 0) {
      spectateGestureRef.current = { mode: null };
      setIsPanningSpectateCamera(false);
    } else if (spectateActivePointersRef.current.size === 1 && spectateGestureRef.current.mode === 'pinch') {
      const [remainingPointerId, remainingPoint] = Array.from(spectateActivePointersRef.current.entries())[0];
      spectateGestureRef.current = {
        mode: 'pan',
        pointerId: remainingPointerId,
        startPointer: remainingPoint,
        startCamera: { ...spectateCameraRef.current },
      };
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  useEffect(() => {
    spectateCameraRef.current = spectateCamera;
  }, [spectateCamera]);

  useEffect(() => {
    if (!multiplayerTabOpen) return undefined;
    const raf = requestAnimationFrame(() => {
      fitSpectateCameraToBoard();
    });
    return () => cancelAnimationFrame(raf);
  }, [fitSpectateCameraToBoard, activeSpectatedPlayer?.id, activeSpectatedSnapshot, multiplayerTabOpen]);

  useEffect(() => {
    const el = spectatePlayAreaRef.current;
    if (!el) return undefined;

    el.addEventListener('wheel', handleSpectateWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleSpectateWheel);
    };
  }, [handleSpectateWheel]);

  const spectatedBoardTransformStyle = {
    transform: `translate(${spectateCamera.x}px, ${spectateCamera.y}px) scale(${spectateCamera.scale})`,
    transformOrigin: '0 0',
  };

  useEffect(() => {
    if (spectatablePlayers.length === 0) {
      if (spectatedPlayerIndex !== 0) {
        setSpectatedPlayerIndex(0);
      }
      return;
    }

    if (spectatedPlayerIndex > spectatablePlayers.length - 1) {
      setSpectatedPlayerIndex(0);
    }
  }, [spectatedPlayerIndex, spectatablePlayers.length]);

  const handlePreviousSpectatedPlayer = useCallback(() => {
    if (spectatablePlayers.length === 0) return;

    setSpectatedPlayerIndex((previousIndex) => (
      previousIndex === 0 ? spectatablePlayers.length - 1 : previousIndex - 1
    ));
  }, [spectatablePlayers.length]);

  const handleNextSpectatedPlayer = useCallback(() => {
    if (spectatablePlayers.length === 0) return;

    setSpectatedPlayerIndex((previousIndex) => (
      previousIndex === spectatablePlayers.length - 1 ? 0 : previousIndex + 1
    ));
  }, [spectatablePlayers.length]);

  const getPlayerStatusClassName = useCallback((player) => {
    if (player?.status === 'In game') {
      return 'in-game';
    }

    return player?.isReady ? 'ready' : 'not-ready';
  }, []);

  const handleBananas = useCallback(() => {
    if (gameMode === 'multiplayer') {
      requestMultiplayerBananas();
      return;
    }

    setSinglePlayerWon(true);
    showNotification('Bananas! You won!');
  }, [gameMode, requestMultiplayerBananas, showNotification]);

  const drawTiles = useCallback((count, actionType = null) => {
    if (bagTiles.length === 0) return;

    if (gameMode === 'multiplayer') {
      requestMultiplayerDraw(count, actionType);
      return;
    }

    const toDraw = Math.min(count, bagTiles.length);
    const drawn = bagTiles.slice(0, toDraw);
    const remaining = bagTiles.slice(toDraw);
    const newTiles = placeTilesInVisibleRegion(drawn, tiles);

    setTiles((prev) => [...prev, ...newTiles]);
    setBagTiles(remaining);
  }, [bagTiles, gameMode, placeTilesInVisibleRegion, requestMultiplayerDraw, tiles]);

  const playersInGameCount = lobbyPlayers.filter((player) => player.status === 'In game').length;
  const tileConstraintMet = tiles.length > 0
    && !hasUngroupedTiles
    && tiles.every((tile) => groups.has(tile.id))
    && new Set(groups.values()).size === 1;

  const showBananasButton = tileConstraintMet && (
    (gameMode !== 'multiplayer' && bagTiles.length === 0)
    || (gameMode === 'multiplayer' && playersInGameCount > 0 && bagTiles.length < playersInGameCount)
  );

  const showPeelButton = tileConstraintMet
    && !showBananasButton
    && (
      (gameMode !== 'multiplayer' && bagTiles.length > 0)
      || (gameMode === 'multiplayer' && playersInGameCount > 0)
    );

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

  const handleDumpTileSelect = useCallback((tileId) => {
    if (!dumpMode) return;
    if (bagTiles.length < 3) return;
    if (groups.has(tileId)) return;

    const tileToDump = tiles.find((tile) => tile.id === tileId);
    if (!tileToDump) return;

    if (gameMode === 'multiplayer') {
      requestMultiplayerDump({ id: tileToDump.id, letter: tileToDump.letter });
      return;
    }

    const remainingTiles = tiles.filter((tile) => tile.id !== tileId);
    const shuffledBag = [...bagTiles];

    for (let i = shuffledBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledBag[i], shuffledBag[j]] = [shuffledBag[j], shuffledBag[i]];
    }

    const drawn = shuffledBag.slice(0, 3);
    const remainingBag = shuffledBag.slice(3);

    remainingBag.push(tileToDump);

    for (let i = remainingBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainingBag[i], remainingBag[j]] = [remainingBag[j], remainingBag[i]];
    }

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
  }, [bagTiles, detachedTileIdsRef, dumpMode, formGroups, gameMode, groups, placeTilesInVisibleRegion, requestMultiplayerDump, setDetachedTileIds, tiles]);

  useEffect(() => {
    if (dumpMode && !hasUngroupedTiles) {
      setDumpMode(false);
    }
  }, [dumpMode, hasUngroupedTiles]);

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
      }),
    );
  }, []);

  const calculateSnapPosition = useCallback((draggedTileId, draggedPos, tilesArray, tileSize = 60) => {
    const snapTolerance = tileSize + 20;
    const gap = 1;
    const snapThreshold = 20;
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

        if (checkCollision(positionToUse, prevTiles.filter((t) => t.id !== id), tileSize)) {
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

  if (screen === 'menu') {
    return (
      <>
        <NotificationBanner message={notification.message} visible={notification.visible} />
        <Menu
          onStartSinglePlayer={handleStartSinglePlayer}
          onStartCreateRoom={() => {
            setGameMode('multiplayer');
            setMultiplayerTabOpen(false);
            setMultiplayerError('');
            setRoomCodeInput('');
            setScreen('createRoomSetup');
          }}
          onStartJoinRoom={() => {
            setGameMode('multiplayer');
            setMultiplayerTabOpen(false);
            setMultiplayerError('');
            setRoomCodeInput('');
            setScreen('joinRoomSetup');
          }}
        />
      </>
    );
  }

  if (screen === 'createRoomSetup') {
    return (
      <>
        <NotificationBanner message={notification.message} visible={notification.visible} />
        <MultiplayerSetup
          mode="create"
          username={multiplayerUsername}
          roomCode={roomCodeInput}
          onUsernameChange={setMultiplayerUsername}
          onRoomCodeChange={setRoomCodeInput}
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
          onBack={() => {
            setMultiplayerError('');
            setRoomCodeInput('');
            setGameMode(null);
            setMultiplayerTabOpen(false);
            setScreen('menu');
          }}
          error={multiplayerError}
        />
      </>
    );
  }

  if (screen === 'joinRoomSetup') {
    return (
      <>
        <NotificationBanner message={notification.message} visible={notification.visible} />
        <MultiplayerSetup
          mode="join"
          username={multiplayerUsername}
          roomCode={roomCodeInput}
          onUsernameChange={setMultiplayerUsername}
          onRoomCodeChange={setRoomCodeInput}
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
          onBack={() => {
            setMultiplayerError('');
            setRoomCodeInput('');
            setGameMode(null);
            setMultiplayerTabOpen(false);
            setScreen('menu');
          }}
          error={multiplayerError}
        />
      </>
    );
  }

  if (screen === 'lobby') {
    return (
      <>
        <NotificationBanner message={notification.message} visible={notification.visible} />
        {multiplayerCountdown !== null && (
          <div className="multiplayer-countdown-overlay" aria-live="polite">
            <p className="multiplayer-countdown-label">Game starts in</p>
            <p className="multiplayer-countdown-number">{multiplayerCountdown}</p>
          </div>
        )}
        <Lobby
          roomCode={roomCode}
          players={lobbyPlayers}
          isHost={isLobbyHost}
          currentPeerId={currentPeerId}
          currentPlayerReady={currentPlayerReady}
          startEnabled={isLobbyHost && allPlayersReady}
          onToggleReady={toggleReady}
          onStartGame={startGame}
          onBack={handleReturnToMenu}
        />
      </>
    );
  }

  return (
    <>
      <NotificationBanner message={notification.message} visible={notification.visible} />
      {multiplayerCountdown !== null && (
        <div className="multiplayer-countdown-overlay" aria-live="polite">
          <p className="multiplayer-countdown-label">Game starts in</p>
          <p className="multiplayer-countdown-number">{multiplayerCountdown}</p>
        </div>
      )}
      <div className="game-container">
        {gameMode === 'multiplayer' && (
          <>
            <button
              className={`multiplayer-tab${multiplayerTabOpen ? ' open' : ''}`}
              onClick={() => {
                setSpectatedPlayerIndex(0);
                setMultiplayerTabOpen(true);
              }}
              aria-label="Open multiplayer player list"
            >
              <Users className="multiplayer-tab-icon" aria-hidden="true" strokeWidth={2.1} />
            </button>

            {multiplayerTabOpen && (
              <div
                className={`multiplayer-panel-overlay${activeSpectatedPlayer ? ' has-spectated-player' : ''}`}
                onClick={() => setMultiplayerTabOpen(false)}
              >
                <section
                  className={`multiplayer-panel${activeSpectatedPlayer ? ' has-spectated-player' : ''}`}
                  onClick={(event) => event.stopPropagation()}
                  aria-label="Multiplayer player list"
                >
                  <div className="multiplayer-panel-header">
                    <div className="multiplayer-panel-room-block">
                      <div className="multiplayer-panel-room-text">
                        <p className="multiplayer-panel-eyebrow">Room Code</p>
                        <h2>{roomCode}</h2>
                      </div>
                      <button
                        className="multiplayer-panel-close-icon"
                        onClick={() => setMultiplayerTabOpen(false)}
                        aria-label="Close multiplayer panel"
                      >
                        x
                      </button>
                    </div>
                  </div>

                  <div className="multiplayer-panel-self">
                    <div className="multiplayer-panel-meta-row">
                      <div className="multiplayer-panel-name">
                        {currentLobbyPlayer?.username || multiplayerUsername}
                        {' (You)'}
                      </div>
                      {currentLobbyPlayer?.isHost && <Crown size={20} />}
                      <span className={`multiplayer-player-status ${getPlayerStatusClassName(currentLobbyPlayer)}`}>
                        {currentLobbyPlayer?.status || 'Not Ready'}
                      </span>
                    </div>
                  </div>

                  <div className="multiplayer-carousel">
                    <div className="multiplayer-carousel-header">
                      <button
                        className="multiplayer-carousel-nav"
                        onClick={handlePreviousSpectatedPlayer}
                        disabled={spectatablePlayers.length <= 1}
                        aria-label="View previous player"
                      >
                        <ChevronLeft aria-hidden="true" />
                      </button>

                      <div className="multiplayer-carousel-title-wrap">
                        <p className="multiplayer-panel-eyebrow">Spectating</p>
                        <h3 className="multiplayer-carousel-title">
                          {activeSpectatedPlayer ? (
                            <>
                              {activeSpectatedPlayer.username}
                              {activeSpectatedPlayer.isHost && (
                                <>
                                  {' '}
                                  <Crown size={16} aria-label="Host" />
                                </>
                              )}
                            </>
                          ) : 'No Other Players In Game'}
                        </h3>
                      </div>

                      <button
                        className="multiplayer-carousel-nav"
                        onClick={handleNextSpectatedPlayer}
                        disabled={spectatablePlayers.length <= 1}
                        aria-label="View next player"
                      >
                        <ChevronRight aria-hidden="true" />
                      </button>
                    </div>

                    <div className="multiplayer-carousel-stage">
                      {!activeSpectatedPlayer && (
                        <p className="multiplayer-carousel-empty">
                          Other players will appear here once they are in game.
                        </p>
                      )}
                      {activeSpectatedPlayer && activeSpectatedSnapshot && (
                        <div
                          ref={spectatePlayAreaRef}
                          className={`spectated-board ${isPanningSpectateCamera ? 'camera-panning' : ''}`}
                          onPointerDown={handleSpectatePointerDown}
                          onPointerMove={handleSpectatePointerMove}
                          onPointerUp={handleSpectatePointerUp}
                          onPointerCancel={handleSpectatePointerUp}
                        >
                          <div className="spectated-board-content" style={spectatedBoardTransformStyle}>
                            {normalizedSpectatedTiles.map((tile) => (
                              <div
                                key={tile.id}
                                className="spectated-tile"
                                style={{
                                  left: `${tile.normalizedX}px`,
                                  top: `${tile.normalizedY}px`,
                                }}
                              >
                                <div className="tile-content">
                                  {tile.letter}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {activeSpectatedPlayer && !activeSpectatedSnapshot && (
                        <p className="multiplayer-carousel-empty">
                          Loading board...
                        </p>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            )}
          </>
        )}

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

            {gameMode !== 'multiplayer' && (
              <button className="btn" onClick={() => { drawTiles(21); setMenuOpen(false); }}>
                Draw 21 Tiles
              </button>
            )}
            <button className="btn" onClick={() => { resetView(tiles); setMenuOpen(false); }}>
              Fit to Tiles
            </button>
            <label className="dictionary-toggle">
              <input
                type="checkbox"
                checked={useDictionary}
                onChange={(event) => setUseDictionary(event.target.checked)}
              />
              <span>Use Dictionary</span>
            </label>
            {gameMode !== 'multiplayer' && (
              <button className="btn" onClick={() => { initializeGame(); setMenuOpen(false); }}>
                CLEAR
              </button>
            )}
            <button className="btn" onClick={handleReturnToMenu}>
              Exit
            </button>
          </div>

          {gameMode === 'multiplayer' && multiplayerWinner ? (
            <button className="btn" onClick={handleReturnToLobby}>
              Return to Lobby
            </button>
          ) : (
            <div className="bag-info">
              {singlePlayerWon ? 'You win' : `Tiles in bag: ${bagTiles.length}`}
            </div>
          )}

          <div className="controls-actions">
            {(hasUngroupedTiles || dumpMode) && (
              <button
                className={`btn ${dumpMode ? 'dump-mode-active' : ''}`.trim()}
                onClick={handleDumpModeToggle}
                disabled={bagTiles.length < 3 || Boolean(multiplayerWinner)}
              >
                {dumpMode ? 'Cancel Dump' : 'DUMP'}
              </button>
            )}
            {showPeelButton && !multiplayerWinner && (
              <button className="btn" onClick={() => drawTiles(1, 'peels')}>
                PEEL
              </button>
            )}
            {showBananasButton && !multiplayerWinner && (
              <button className="btn" onClick={handleBananas}>
                BANANAS
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
          onPointerDown={handlePlayAreaPointerDown}
          onPointerMove={handlePlayAreaPointerMove}
          onPointerUp={handlePlayAreaPointerUp}
          onPointerCancel={handlePlayAreaPointerUp}
        >
          <div className="board" style={boardTransformStyle}>
            {tiles.map((tile) => (
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
    </>
  );
}

export default App;
