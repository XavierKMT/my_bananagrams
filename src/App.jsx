import { useState, useEffect, useCallback, useRef } from 'react';
import Menu from './Menu';
import MultiplayerSetup from './MultiplayerSetup';
import Lobby from './Lobby';
import NotificationBanner from './NotificationBanner';
import GameScreen from './GameScreen';
import './App.css';
import { BOARD_TILE_LIMIT } from './constants';
import { useCamera } from './hooks/useCamera';
import { useBoardState } from './hooks/useBoardState';
import { useSinglePlayerGame } from './hooks/useSinglePlayerGame';
import { useMultiplayer } from './hooks/useMultiplayer';

function App() {
  const [screen, setScreen] = useState('menu');
  const [gameMode, setGameMode] = useState(null);
  const [multiplayerTabOpen, setMultiplayerTabOpen] = useState(false);
  const [spectatedPlayerIndex, setSpectatedPlayerIndex] = useState(0);
  const [multiplayerCountdown, setMultiplayerCountdown] = useState(null);
  const [multiplayerWinner, setMultiplayerWinner] = useState(null);
  const [playerBoardSnapshots, setPlayerBoardSnapshots] = useState(new Map());
  const [spectateCamera, setSpectateCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanningSpectateCamera, setIsPanningSpectateCamera] = useState(false);

  const playAreaRef = useRef(null);
  const spectatePlayAreaRef = useRef(null);
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
  } = useBoardState({
    cameraRef,
    getTileSize,
    getBoardSize,
    getPlayAreaRect,
  });

  const {
    singlePlayerWon,
    singlePlayerGameType,
    singlePlayerTimerResetKey,
    resetSinglePlayerState,
    initializeSinglePlayerGame,
    startSinglePlayerGame,
    drawSinglePlayerTiles,
    handleSinglePlayerBananas,
    handleSinglePlayerDump,
  } = useSinglePlayerGame({
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
  });

  const handleEnterLobby = useCallback(() => {
    setGameMode('multiplayer');
    setMultiplayerCountdown(null);
    setMultiplayerWinner(null);
    setPlayerBoardSnapshots(new Map());
    setSpectatedPlayerIndex(0);
    setMultiplayerTabOpen(false);
    setScreen('lobby');
  }, []);

  const handleStartSinglePlayer = useCallback(() => {
    setGameMode('singlePlayer');
    initializeSinglePlayerGame();
    setScreen('game');
  }, [initializeSinglePlayerGame]);

  const handleMultiplayerReturnToMenu = useCallback(() => {
    setMultiplayerCountdown(null);
    setMultiplayerWinner(null);
    resetSinglePlayerState();
    setGameMode(null);
    setMultiplayerTabOpen(false);
    setScreen('menu');
  }, [resetSinglePlayerState]);

  const handleCountdownStart = useCallback((seconds) => {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      setMultiplayerCountdown(null);
      return;
    }

    setMultiplayerCountdown(Math.ceil(seconds));
  }, []);

  const handleMultiplayerDraw = useCallback((drawnTiles, remainingBagCount) => {
    const tilesToPlace = Array.isArray(drawnTiles) ? drawnTiles : [];

    if (tilesToPlace.length > 0) {
      setTiles((previousTiles) => [
        ...previousTiles,
        ...placeTilesInVisibleRegion(tilesToPlace, previousTiles, {
          horizontalSpawnPaddingRatio: 0.2,
        }),
      ]);
    }

    if (Number.isFinite(remainingBagCount)) {
      setBagTiles(createSharedBagPlaceholders(remainingBagCount));
    }
  }, [createSharedBagPlaceholders, placeTilesInVisibleRegion, setBagTiles, setTiles]);

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
  }, [
    createSharedBagPlaceholders,
    detachedTileIdsRef,
    formGroups,
    placeTilesInVisibleRegion,
    setBagTiles,
    setDetachedTileIds,
    setDumpMode,
    setTiles,
    tilesRef,
  ]);

  const handleBagCountUpdate = useCallback((remainingBagCount) => {
    if (!Number.isFinite(remainingBagCount)) return;
    setBagTiles(createSharedBagPlaceholders(remainingBagCount));
  }, [createSharedBagPlaceholders, setBagTiles]);

  const handleMultiplayerGameStartWithData = useCallback((gameStartData) => {
    const initialTiles = Array.isArray(gameStartData?.initialTiles) ? gameStartData.initialTiles : [];
    const remainingBagCount = Number(gameStartData?.remainingBagCount);

    setMultiplayerCountdown(null);
    setMultiplayerWinner(null);
    setGameMode('multiplayer');
    resetSinglePlayerState();
    setPlayerBoardSnapshots(new Map());
    setSpectatedPlayerIndex(0);
    setMultiplayerTabOpen(false);
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
  }, [
    centerCameraOnBoard,
    createSharedBagPlaceholders,
    placeTilesInVisibleRegion,
    resetGroupingState,
    resetSinglePlayerState,
    setBagTiles,
    setDumpMode,
    setTiles,
  ]);

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
    multiplayerGameType,
    allPlayersReady,
    currentPlayerReady,
    createRoom,
    joinRoom,
    toggleReady,
    updateMultiplayerGameType,
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
    resetSinglePlayerState();
    setMultiplayerTabOpen(false);
    setScreen('menu');
    setMenuOpen(false);
  }, [gameMode, leaveLobby, resetSinglePlayerState, setMenuOpen]);

  const handleReturnToLobby = useCallback(() => {
    if (gameMode !== 'multiplayer') {
      return;
    }

    returnToLobby();
    setMenuOpen(false);
    setMultiplayerTabOpen(false);
    setScreen('lobby');
  }, [gameMode, returnToLobby, setMenuOpen]);

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
  const spectatablePlayers = lobbyPlayers.filter((player) => player.id !== currentPeerId);
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

    handleSinglePlayerBananas();
  }, [gameMode, handleSinglePlayerBananas, requestMultiplayerBananas]);

  const drawTiles = useCallback((count, actionType = null) => {
    if (bagTiles.length === 0) return;

    if (gameMode === 'multiplayer') {
      requestMultiplayerDraw(count, actionType);
      return;
    }

    drawSinglePlayerTiles(count);
  }, [bagTiles.length, drawSinglePlayerTiles, gameMode, requestMultiplayerDraw]);

  const playersInGameCount = lobbyPlayers.filter((player) => player.status === 'In game').length;
  const tileConstraintMet = tiles.length > 0
    && !hasUngroupedTiles
    && tiles.every((tile) => groups.has(tile.id))
    && new Set(groups.values()).size === 1;
  const isShortSinglePlayerGame = gameMode === 'singlePlayer' && singlePlayerGameType === 'short';
  const isLongSinglePlayerGame = gameMode === 'singlePlayer' && singlePlayerGameType === 'long';
  const isShortMultiplayerGame = gameMode === 'multiplayer' && multiplayerGameType === 'short';
  const isLongMultiplayerGame = gameMode === 'multiplayer' && multiplayerGameType !== 'short';
  const isTimerRunning = screen === 'game' && (
    (gameMode === 'multiplayer' && !multiplayerWinner)
    || (gameMode === 'singlePlayer' && singlePlayerGameType !== null && !singlePlayerWon)
  );

  const showBananasButton = tileConstraintMet && (
    isShortSinglePlayerGame
    || (isLongSinglePlayerGame && bagTiles.length === 0)
    || (isShortMultiplayerGame && playersInGameCount > 0)
    || (isLongMultiplayerGame && playersInGameCount > 0 && bagTiles.length < playersInGameCount)
  );

  const showPeelButton = tileConstraintMet
    && !showBananasButton
    && (
      isLongSinglePlayerGame
      || (isLongMultiplayerGame && playersInGameCount > 0)
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
  }, [bagTiles.length, dumpMode, setDumpMode]);

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

    handleSinglePlayerDump(tileId);
  }, [bagTiles.length, dumpMode, gameMode, groups, handleSinglePlayerDump, requestMultiplayerDump, tiles]);


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
          countdownActive={multiplayerCountdown !== null}
          gameType={multiplayerGameType}
          onGameTypeChange={updateMultiplayerGameType}
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
      <GameScreen
        gameMode={gameMode}
        multiplayerTabOpen={multiplayerTabOpen}
        onOpenMultiplayerPanel={() => {
          setSpectatedPlayerIndex(0);
          setMultiplayerTabOpen(true);
        }}
        onCloseMultiplayerPanel={() => setMultiplayerTabOpen(false)}
        roomCode={roomCode}
        currentLobbyPlayer={currentLobbyPlayer}
        multiplayerUsername={multiplayerUsername}
        getPlayerStatusClassName={getPlayerStatusClassName}
        onPreviousSpectatedPlayer={handlePreviousSpectatedPlayer}
        onNextSpectatedPlayer={handleNextSpectatedPlayer}
        spectatablePlayers={spectatablePlayers}
        activeSpectatedPlayer={activeSpectatedPlayer}
        activeSpectatedSnapshot={activeSpectatedSnapshot}
        spectatePlayAreaRef={spectatePlayAreaRef}
        isPanningSpectateCamera={isPanningSpectateCamera}
        onSpectatePointerDown={handleSpectatePointerDown}
        onSpectatePointerMove={handleSpectatePointerMove}
        onSpectatePointerUp={handleSpectatePointerUp}
        spectatedBoardTransformStyle={spectatedBoardTransformStyle}
        normalizedSpectatedTiles={normalizedSpectatedTiles}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onFitToTiles={() => {
          resetView(tiles);
          setMenuOpen(false);
        }}
        useDictionary={useDictionary}
        onToggleUseDictionary={setUseDictionary}
        onClearBoard={() => {
          initializeSinglePlayerGame();
          setMenuOpen(false);
        }}
        onExit={handleReturnToMenu}
        multiplayerWinner={multiplayerWinner}
        onReturnToLobby={handleReturnToLobby}
        singlePlayerWon={singlePlayerWon}
        showSinglePlayerGameTypePicker={gameMode === 'singlePlayer' && singlePlayerGameType === null}
        onSelectShortGame={() => startSinglePlayerGame('short')}
        onSelectLongGame={() => startSinglePlayerGame('long')}
        bagTileCount={bagTiles.length}
        hasUngroupedTiles={hasUngroupedTiles}
        dumpMode={dumpMode}
        onToggleDumpMode={handleDumpModeToggle}
        showPeelButton={showPeelButton}
        onPeel={() => drawTiles(1, 'peels')}
        showBananasButton={showBananasButton}
        onBananas={handleBananas}
        playAreaRef={playAreaRef}
        isPanningCamera={isPanningCamera}
        onPlayAreaPointerDown={handlePlayAreaPointerDown}
        onPlayAreaPointerMove={handlePlayAreaPointerMove}
        onPlayAreaPointerUp={handlePlayAreaPointerUp}
        isTimerRunning={isTimerRunning}
        timerResetKey={gameMode === 'singlePlayer' ? singlePlayerTimerResetKey : 0}
        boardTransformStyle={boardTransformStyle}
        tiles={tiles}
        groups={groups}
        groupedBorderSides={groupedBorderSides}
        tileDictionaryState={tileDictionaryState}
        onTilePositionChange={updateTilePosition}
        onUngroupTile={handleUngroupTile}
        onRegisterTileElement={registerTileElement}
        screenToBoard={screenToBoard}
        onDumpSelect={handleDumpTileSelect}
      />
    </>
  );
}

export default App;
