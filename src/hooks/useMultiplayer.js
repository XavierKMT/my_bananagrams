import { useState, useEffect, useCallback, useRef } from 'react';
import Peer from 'peerjs';
import { TILE_DISTRIBUTION } from '../constants';

const READY_STATUS = 'Ready';
const NOT_READY_STATUS = 'Not Ready';
const IN_GAME_STATUS = 'In game';
// const PEER_ICE_CONFIG = {
//   config: {
//     iceServers: [
//       { urls: 'stun:stun.l.google.com:19302' },
//       { urls: 'stun:stun1.l.google.com:19302' },
//     ],
//   },
// };

export function useMultiplayer({
  onEnterLobby,
  onGameStart,
  onReturnToMenu,
  onNotify,
  onWin,
  onCountdownStart,
  onMultiplayerDraw,
  onMultiplayerDump,
  onBagCountUpdate,
  onBoardSnapshot,
}) {
  const [multiplayerUsername, setMultiplayerUsername] = useState('');
  const [multiplayerError, setMultiplayerError] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [isLobbyHost, setIsLobbyHost] = useState(false);
  const [currentPeerId, setCurrentPeerId] = useState('');

  const peerRef = useRef(null);
  const currentPeerIdRef = useRef('');
  const hostConnectionRef = useRef(null);
  const hostConnectionsRef = useRef(new Map());
  const lobbyPlayersRef = useRef(lobbyPlayers);
  const onEnterLobbyRef = useRef(onEnterLobby);
  const onGameStartRef = useRef(onGameStart);
  const onReturnToMenuRef = useRef(onReturnToMenu);
  const onNotifyRef = useRef(onNotify);
  const onCountdownStartRef = useRef(onCountdownStart);
  const onMultiplayerDrawRef = useRef(onMultiplayerDraw);
  const onMultiplayerDumpRef = useRef(onMultiplayerDump);
  const onBagCountUpdateRef = useRef(onBagCountUpdate);
  const onWinRef = useRef(onWin);
  const onBoardSnapshotRef = useRef(onBoardSnapshot);
  const intentionalLeaveRef = useRef(false);
  const gameStartTimeoutRef = useRef(null);
  const sharedBagRef = useRef([]);
  const playerBoardSnapshotsRef = useRef(new Map());

  useEffect(() => {
    lobbyPlayersRef.current = lobbyPlayers;
  }, [lobbyPlayers]);

  useEffect(() => {
    onEnterLobbyRef.current = onEnterLobby;
  }, [onEnterLobby]);

  useEffect(() => {
    onGameStartRef.current = onGameStart;
  }, [onGameStart]);

  useEffect(() => {
    onReturnToMenuRef.current = onReturnToMenu;
  }, [onReturnToMenu]);

  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  useEffect(() => {
    onCountdownStartRef.current = onCountdownStart;
  }, [onCountdownStart]);

  useEffect(() => {
    onMultiplayerDrawRef.current = onMultiplayerDraw;
  }, [onMultiplayerDraw]);

  useEffect(() => {
    onMultiplayerDumpRef.current = onMultiplayerDump;
  }, [onMultiplayerDump]);

  useEffect(() => {
    onBagCountUpdateRef.current = onBagCountUpdate;
  }, [onBagCountUpdate]);

  useEffect(() => {
    onWinRef.current = onWin;
  }, [onWin]);

  useEffect(() => {
    onBoardSnapshotRef.current = onBoardSnapshot;
  }, [onBoardSnapshot]);

  const createShuffledBag = useCallback(() => {
    const tiles = [];
    let tileId = 0;

    Object.entries(TILE_DISTRIBUTION).forEach(([letter, count]) => {
      for (let i = 0; i < count; i += 1) {
        tiles.push({ id: tileId, letter });
        tileId += 1;
      }
    });

    for (let i = tiles.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }

    return tiles;
  }, []);

  const drawFromSharedBag = useCallback((count) => {
    if (!Number.isFinite(count) || count <= 0) {
      return [];
    }

    const drawCount = Math.min(Math.floor(count), sharedBagRef.current.length);
    if (drawCount <= 0) {
      return [];
    }

    return sharedBagRef.current.splice(0, drawCount);
  }, []);

  const broadcastBagCount = useCallback(() => {
    const remainingBagCount = sharedBagRef.current.length;

    hostConnectionsRef.current.forEach((connection) => {
      if (!connection.open) return;
      connection.send({ type: 'bag-count-update', remainingBagCount });
    });

    onBagCountUpdateRef.current?.(remainingBagCount);
  }, []);

  const broadcastNotification = useCallback((message, excludedPeerId = null) => {
    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage) return;

    const normalizedExcludedPeerId = typeof excludedPeerId === 'string'
      ? excludedPeerId.trim()
      : '';

    hostConnectionsRef.current.forEach((connection) => {
      if (!connection.open) return;
      if (normalizedExcludedPeerId && connection.peer === normalizedExcludedPeerId) return;
      connection.send({ type: 'player-action', message: normalizedMessage });
    });

    if (!normalizedExcludedPeerId || currentPeerId !== normalizedExcludedPeerId) {
      onNotifyRef.current?.(normalizedMessage);
    }
  }, [currentPeerId]);

  const broadcastWinState = useCallback((message) => {
    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage) return;

    hostConnectionsRef.current.forEach((connection) => {
      if (!connection.open) return;
      connection.send({ type: 'win-state', message: normalizedMessage });
    });

    onWinRef.current?.(normalizedMessage);
  }, []);

  const broadcastPlayerAction = useCallback((playerId, actionType) => {
    const normalizedAction = String(actionType || '').trim();
    if (!playerId || !normalizedAction) return;

    const player = lobbyPlayersRef.current.find((entry) => entry.id === playerId);
    const username = player?.username?.trim();
    if (!username) return;

    broadcastNotification(`${username} ${normalizedAction}`, playerId);
  }, [broadcastNotification]);

  const processPeelRequest = useCallback((playerId) => {
    const player = lobbyPlayersRef.current.find((entry) => entry.id === playerId);
    const username = player?.username?.trim() || 'A player';
    const playersInGame = lobbyPlayersRef.current.filter((entry) => entry.status === IN_GAME_STATUS);

    if (playersInGame.length === 0) {
      return { ok: false, notification: null };
    }

    if (sharedBagRef.current.length < playersInGame.length) {
      return {
        ok: false,
        notification: `${username} has won!`,
      };
    }

    const dealtTilesByPlayer = new Map();
    playersInGame.forEach((entry) => {
      dealtTilesByPlayer.set(entry.id, drawFromSharedBag(1));
    });

    return {
      ok: true,
      dealtTilesByPlayer,
      remainingBagCount: sharedBagRef.current.length,
      notification: `${username} peeled`,
    };
  }, [drawFromSharedBag]);

  const processBananasRequest = useCallback((playerId) => {
    const player = lobbyPlayersRef.current.find((entry) => entry.id === playerId);
    const username = player?.username?.trim() || 'A player';
    const playersInGame = lobbyPlayersRef.current.filter((entry) => entry.status === IN_GAME_STATUS);

    if (playersInGame.length === 0) {
      return { ok: false, reason: 'No players are currently in game.' };
    }

    if (sharedBagRef.current.length >= playersInGame.length) {
      return {
        ok: false,
        reason: 'Bananas is only available when fewer tiles than players remain in the bag.',
      };
    }

    return {
      ok: true,
      notification: `${username} has won!`,
    };
  }, []);

  const shuffleBag = useCallback(() => {
    for (let i = sharedBagRef.current.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [sharedBagRef.current[i], sharedBagRef.current[j]] = [sharedBagRef.current[j], sharedBagRef.current[i]];
    }
  }, []);

  const processDumpRequest = useCallback((tile) => {
    const tileId = Number(tile?.id);
    const tileLetter = String(tile?.letter || '').trim();

    if (!Number.isFinite(tileId) || !tileLetter) {
      return { ok: false, reason: 'Invalid dump request.' };
    }

    if (sharedBagRef.current.length < 3) {
      return { ok: false, reason: 'Not enough tiles in the bag to dump.' };
    }

    const drawnTiles = drawFromSharedBag(3);
    sharedBagRef.current.push({ id: tileId, letter: tileLetter });
    shuffleBag();

    return {
      ok: true,
      removedTileId: tileId,
      drawnTiles,
      remainingBagCount: sharedBagRef.current.length,
    };
  }, [drawFromSharedBag, shuffleBag]);

  const cleanupPeerConnections = useCallback(() => {
    if (gameStartTimeoutRef.current) {
      window.clearTimeout(gameStartTimeoutRef.current);
      gameStartTimeoutRef.current = null;
    }

    sharedBagRef.current = [];

    hostConnectionRef.current?.close();
    hostConnectionRef.current = null;

    hostConnectionsRef.current.forEach((connection) => {
      connection.close();
    });
    hostConnectionsRef.current.clear();

    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
  }, []);

  const resetMultiplayerState = useCallback(() => {
    intentionalLeaveRef.current = false;
    currentPeerIdRef.current = '';
    setCurrentPeerId('');
    setRoomCode('');
    setLobbyPlayers([]);
    lobbyPlayersRef.current = [];
    setIsLobbyHost(false);
    sharedBagRef.current = [];
  }, []);

  const syncLobbyPlayers = useCallback((nextPlayers) => {
    setLobbyPlayers(nextPlayers);
    lobbyPlayersRef.current = nextPlayers;

    hostConnectionsRef.current.forEach((connection) => {
      if (!connection.open) return;
      connection.send({
        type: 'lobby-update',
        players: nextPlayers,
      });
    });
  }, []);

  const generateRoomCode = useCallback(() => {
    return String(Math.floor(100000 + (Math.random() * 900000)));
  }, []);

  const createRoom = useCallback(() => {
    intentionalLeaveRef.current = false;
    const trimmedName = multiplayerUsername.trim();
    if (!trimmedName) {
      setMultiplayerError('Enter a username first.');
      return;
    }

    cleanupPeerConnections();
    setMultiplayerError('');
    setIsLobbyHost(true);

    const createHostPeer = (attempt = 0) => {
      const nextRoomCode = generateRoomCode();
      // const peer = new Peer(nextRoomCode, PEER_ICE_CONFIG);
      const peer = new Peer(nextRoomCode);
      peerRef.current = peer;

      let opened = false;

      peer.on('open', (id) => {
        opened = true;
        const hostPlayer = {
          id,
          username: trimmedName,
          isHost: true,
          isReady: false,
          status: NOT_READY_STATUS,
        };
        currentPeerIdRef.current = id;
        setCurrentPeerId(id);
        setRoomCode(id);
        syncLobbyPlayers([hostPlayer]);
        onEnterLobbyRef.current?.();
      });

      peer.on('connection', (connection) => {
        hostConnectionsRef.current.set(connection.peer, connection);

        connection.on('data', (message) => {
          if (!message) return;

          if (message.type === 'return-to-lobby') {
            const requestedId = String(message.peerId || connection.peer).trim();
            const nextPlayers = lobbyPlayersRef.current.map((player) => (
              player.id === requestedId
                ? { ...player, isReady: true, status: READY_STATUS }
                : player
            ));
            syncLobbyPlayers(nextPlayers);
            return;
          }

          if (message.type === 'ready-toggle') {
            const requestedId = String(message.peerId || connection.peer).trim();
            const isReady = Boolean(message.isReady);
            const nextPlayers = lobbyPlayersRef.current.map((player) => (
              player.id === requestedId
                ? { ...player, isReady, status: isReady ? READY_STATUS : NOT_READY_STATUS }
                : player
            ));
            syncLobbyPlayers(nextPlayers);
            return;
          }

          if (message.type === 'draw-request') {
            const requestedCount = Number(message.count);

            if (message.actionType === 'peels') {
              const peelResult = processPeelRequest(connection.peer);

              if (!peelResult.ok) {
                if (peelResult.notification) {
                  broadcastNotification(peelResult.notification, connection.peer);
                  broadcastWinState(peelResult.notification);
                }
                return;
              }

              const { dealtTilesByPlayer, remainingBagCount } = peelResult;

              hostConnectionsRef.current.forEach((hostConnection) => {
                if (!hostConnection.open) return;
                hostConnection.send({
                  type: 'draw-result',
                  tiles: dealtTilesByPlayer.get(hostConnection.peer) || [],
                  remainingBagCount,
                });
              });

              onMultiplayerDrawRef.current?.(
                dealtTilesByPlayer.get(currentPeerIdRef.current) || [],
                remainingBagCount,
              );

              broadcastBagCount();
              broadcastNotification(peelResult.notification, connection.peer);
              return;
            }

            const drawnTiles = drawFromSharedBag(requestedCount);
            const remainingBagCount = sharedBagRef.current.length;

            if (connection.open) {
              connection.send({
                type: 'draw-result',
                tiles: drawnTiles,
                remainingBagCount,
              });
            }

            broadcastBagCount();
            return;
          }

          if (message.type === 'dump-request') {
            const result = processDumpRequest(message.tile);

            if (!connection.open) {
              return;
            }

            if (!result.ok) {
              connection.send({
                type: 'dump-rejected',
                reason: result.reason || 'Unable to dump tile.',
              });
              return;
            }

            connection.send({
              type: 'dump-result',
              removedTileId: result.removedTileId,
              tiles: result.drawnTiles,
              remainingBagCount: result.remainingBagCount,
            });

            broadcastBagCount();
            broadcastPlayerAction(connection.peer, 'dumped');
            return;
          }

          if (message.type === 'bananas-request') {
            const result = processBananasRequest(connection.peer);

            if (!connection.open) {
              return;
            }

            if (!result.ok) {
              connection.send({
                type: 'bananas-rejected',
                reason: result.reason || 'Bananas is not available right now.',
              });
              return;
            }

            broadcastNotification(result.notification, connection.peer);
            broadcastWinState(result.notification);
            return;
          }

          if (message.type === 'board-snapshot') {
            const playerId = String(connection.peer || '').trim();
            const snapshot = message.snapshot;
            console.log('[Board] Host received board snapshot from player:', playerId, snapshot);
            if (playerId && snapshot) {
              playerBoardSnapshotsRef.current.set(playerId, snapshot);
              onBoardSnapshotRef.current?.(playerId, snapshot);

              hostConnectionsRef.current.forEach((hostConnection) => {
                if (!hostConnection.open) return;
                if (hostConnection.peer === playerId) return;
                hostConnection.send({
                  type: 'board-data',
                  playerId,
                  snapshot,
                });
              });
            }
            return;
          }

          if (message.type !== 'join-request') return;

          const requestedName = String(message.username || '').trim();
          const requestedId = String(message.peerId || connection.peer).trim();

          if (!requestedName || !requestedId) {
            connection.send({ type: 'join-rejected', reason: 'Invalid join request.' });
            connection.close();
            return;
          }

          const currentPlayers = lobbyPlayersRef.current;

          if (currentPlayers.length >= 4) {
            connection.send({ type: 'join-rejected', reason: 'Lobby is full.' });
            connection.close();
            return;
          }

          const alreadyJoined = currentPlayers.some((player) => player.id === requestedId);
          if (alreadyJoined) {
            connection.send({ type: 'join-rejected', reason: 'Player already in lobby.' });
            connection.close();
            return;
          }

          const nextPlayers = [
            ...currentPlayers,
            {
              id: requestedId,
              username: requestedName,
              isHost: false,
              isReady: false,
              status: NOT_READY_STATUS,
            },
          ];
          syncLobbyPlayers(nextPlayers);

          connection.send({
            type: 'join-accepted',
            roomCode: peerRef.current?.id || '',
            players: nextPlayers,
          });
        });

        const removePlayer = () => {
          hostConnectionsRef.current.delete(connection.peer);
          const nextPlayers = lobbyPlayersRef.current.filter((player) => player.id !== connection.peer);
          syncLobbyPlayers(nextPlayers);
        };

        connection.on('close', removePlayer);
        connection.on('error', removePlayer);
      });

      peer.on('error', (error) => {
        if (!opened && error?.type === 'unavailable-id' && attempt < 8) {
          peer.destroy();
          createHostPeer(attempt + 1);
          return;
        }

        setMultiplayerError('Unable to create room. Please try again.');
        cleanupPeerConnections();
        resetMultiplayerState();
      });
    };

    createHostPeer();
  }, [
    broadcastBagCount,
    broadcastNotification,
    broadcastWinState,
    broadcastPlayerAction,
    cleanupPeerConnections,
    drawFromSharedBag,
    generateRoomCode,
    multiplayerUsername,
    processPeelRequest,
    processDumpRequest,
    processBananasRequest,
    resetMultiplayerState,
    syncLobbyPlayers,
  ]);

  const joinRoom = useCallback(() => {
    intentionalLeaveRef.current = false;
    const trimmedName = multiplayerUsername.trim();
    if (!trimmedName) {
      setMultiplayerError('Enter a username first.');
      return;
    }

    const requestedRoomCode = roomCodeInput.trim();
    if (!/^\d{6}$/.test(requestedRoomCode)) {
      setMultiplayerError('Enter a valid 6-digit room code.');
      return;
    }

    cleanupPeerConnections();
    setMultiplayerError('');
    setIsLobbyHost(false);

    // const peer = new Peer(PEER_ICE_CONFIG);
    const peer = new Peer();
    peerRef.current = peer;
    let hasJoinedLobby = false;
    let forceReturnToMainMenu = null;

    peer.on('open', (id) => {
      currentPeerIdRef.current = id;
      setCurrentPeerId(id);
      const connection = peer.connect(requestedRoomCode, { reliable: true });
      hostConnectionRef.current = connection;

      const joinTimeout = window.setTimeout(() => {
        if (hasJoinedLobby) return;
        setMultiplayerError('Room not found or unavailable.');
        cleanupPeerConnections();
        resetMultiplayerState();
      }, 8000);

      forceReturnToMainMenu = (reason) => {
        window.clearTimeout(joinTimeout);
        cleanupPeerConnections();
        resetMultiplayerState();
        if (reason) {
          setMultiplayerError(reason);
          onNotifyRef.current?.(reason);
        }
        onReturnToMenuRef.current?.();
      };

      connection.on('open', () => {
        connection.send({
          type: 'join-request',
          username: trimmedName,
          peerId: id,
        });
      });

      connection.on('data', (message) => {
        if (!message) return;

        if (message.type === 'join-accepted') {
          hasJoinedLobby = true;
          window.clearTimeout(joinTimeout);
          setRoomCode(String(message.roomCode || requestedRoomCode));
          setLobbyPlayers(Array.isArray(message.players) ? message.players : []);
          onEnterLobbyRef.current?.();
          return;
        }

        if (message.type === 'lobby-update') {
          setLobbyPlayers(Array.isArray(message.players) ? message.players : []);
          return;
        }

        if (message.type === 'game-start') {
          const initialTiles = Array.isArray(message.initialTiles) ? message.initialTiles : [];
          const remainingBagCount = Number(message.remainingBagCount);
          onGameStartRef.current?.({
            initialTiles,
            remainingBagCount: Number.isFinite(remainingBagCount) ? remainingBagCount : 0,
          });
          return;
        }

        if (message.type === 'draw-result') {
          const tiles = Array.isArray(message.tiles) ? message.tiles : [];
          const remainingBagCount = Number(message.remainingBagCount);
          onMultiplayerDrawRef.current?.(
            tiles,
            Number.isFinite(remainingBagCount) ? remainingBagCount : 0,
          );
          return;
        }

        if (message.type === 'dump-result') {
          const tiles = Array.isArray(message.tiles) ? message.tiles : [];
          const removedTileId = Number(message.removedTileId);
          const remainingBagCount = Number(message.remainingBagCount);
          onMultiplayerDumpRef.current?.({
            removedTileId: Number.isFinite(removedTileId) ? removedTileId : null,
            drawnTiles: tiles,
            remainingBagCount: Number.isFinite(remainingBagCount) ? remainingBagCount : 0,
          });
          return;
        }

        if (message.type === 'dump-rejected') {
          const reason = String(message.reason || 'Unable to dump tile.');
          onNotifyRef.current?.(reason);
          return;
        }

        if (message.type === 'bananas-rejected') {
          const reason = String(message.reason || 'Bananas is not available right now.');
          onNotifyRef.current?.(reason);
          return;
        }

        if (message.type === 'bag-count-update') {
          const remainingBagCount = Number(message.remainingBagCount);
          if (Number.isFinite(remainingBagCount)) {
            onBagCountUpdateRef.current?.(remainingBagCount);
          }
          return;
        }

        if (message.type === 'game-countdown') {
          const seconds = Number(message.seconds);
          if (Number.isFinite(seconds) && seconds > 0) {
            onCountdownStartRef.current?.(seconds);
          }
          return;
        }

        if (message.type === 'player-action') {
          const actionMessage = String(message.message || '').trim();
          if (actionMessage) {
            onNotifyRef.current?.(actionMessage);
          }
          return;
        }

        if (message.type === 'win-state') {
          const winMessage = String(message.message || '').trim();
          if (winMessage) {
            onWinRef.current?.(winMessage);
          }
          return;
        }

        if (message.type === 'board-data') {
          const playerId = String(message.playerId || '').trim();
          const snapshot = message.snapshot;
          console.log('[Board] User received board data from host for player:', playerId, snapshot);
          if (playerId && snapshot) {
            playerBoardSnapshotsRef.current.set(playerId, snapshot);
            onBoardSnapshotRef.current?.(playerId, snapshot);
          }
          return;
        }

        if (message.type === 'host-left') {
          forceReturnToMainMenu('Host disconnected. Returning to main menu.');
          return;
        }

        if (message.type === 'join-rejected') {
          window.clearTimeout(joinTimeout);
          setMultiplayerError(message.reason || 'Unable to join room.');
          cleanupPeerConnections();
          resetMultiplayerState();
        }
      });

      const failJoin = () => {
        if (intentionalLeaveRef.current) {
          window.clearTimeout(joinTimeout);
          cleanupPeerConnections();
          resetMultiplayerState();
          return;
        }

        if (hasJoinedLobby) {
          forceReturnToMainMenu('Host disconnected. Returning to main menu.');
          return;
        }
        window.clearTimeout(joinTimeout);
        setMultiplayerError('Unable to join room. Check the room code and try again.');
        cleanupPeerConnections();
        resetMultiplayerState();
      };

      connection.on('error', failJoin);
      connection.on('close', failJoin);
    });

    peer.on('error', () => {
      if (intentionalLeaveRef.current) {
        cleanupPeerConnections();
        resetMultiplayerState();
        return;
      }

      if (hasJoinedLobby && forceReturnToMainMenu) {
        forceReturnToMainMenu('Host disconnected. Returning to main menu.');
        return;
      }
      setMultiplayerError('Unable to join room. Check the room code and try again.');
      cleanupPeerConnections();
      resetMultiplayerState();
    });
  }, [cleanupPeerConnections, multiplayerUsername, resetMultiplayerState, roomCodeInput]);

  const toggleReady = useCallback(() => {
    if (!currentPeerId) return;

    const currentPlayer = lobbyPlayersRef.current.find((player) => player.id === currentPeerId);
    if (!currentPlayer) return;

    const nextReady = !currentPlayer.isReady;

    if (isLobbyHost) {
      const nextPlayers = lobbyPlayersRef.current.map((player) => (
        player.id === currentPeerId
          ? { ...player, isReady: nextReady, status: nextReady ? READY_STATUS : NOT_READY_STATUS }
          : player
      ));
      syncLobbyPlayers(nextPlayers);
      return;
    }

    const nextPlayers = lobbyPlayersRef.current.map((player) => (
      player.id === currentPeerId
        ? { ...player, isReady: nextReady, status: nextReady ? READY_STATUS : NOT_READY_STATUS }
        : player
    ));
    setLobbyPlayers(nextPlayers);
    lobbyPlayersRef.current = nextPlayers;

    if (hostConnectionRef.current?.open) {
      hostConnectionRef.current.send({
        type: 'ready-toggle',
        peerId: currentPeerId,
        isReady: nextReady,
      });
    }
  }, [currentPeerId, isLobbyHost, syncLobbyPlayers]);

  const startGame = useCallback(() => {
    if (!isLobbyHost) return;
    if (gameStartTimeoutRef.current) return;

    const allReady = lobbyPlayersRef.current.length > 0
      && lobbyPlayersRef.current.every(
        (player) => Boolean(player.isReady) && player.status === READY_STATUS,
      );

    if (!allReady) return;

    const nextPlayers = lobbyPlayersRef.current.map((player) => ({
      ...player,
      status: IN_GAME_STATUS,
    }));

    syncLobbyPlayers(nextPlayers);

    const countdownSeconds = 3;

    hostConnectionsRef.current.forEach((connection) => {
      if (!connection.open) return;
      connection.send({ type: 'game-countdown', seconds: countdownSeconds });
    });

    onCountdownStartRef.current?.(countdownSeconds);

    gameStartTimeoutRef.current = window.setTimeout(() => {
      gameStartTimeoutRef.current = null;

      const fullBag = createShuffledBag();
      const allocatedTilesByPlayer = new Map();

      lobbyPlayersRef.current.forEach((player) => {
        const initialTiles = fullBag.splice(0, Math.min(21, fullBag.length));
        allocatedTilesByPlayer.set(player.id, initialTiles);
      });

      sharedBagRef.current = fullBag;
      const remainingBagCount = sharedBagRef.current.length;

      hostConnectionsRef.current.forEach((connection) => {
        if (!connection.open) return;
        connection.send({
          type: 'game-start',
          initialTiles: allocatedTilesByPlayer.get(connection.peer) || [],
          remainingBagCount,
        });
      });

      hostConnectionsRef.current.forEach((connection) => {
        if (!connection.open) return;
        connection.send({ type: 'bag-count-update', remainingBagCount });
      });

      onGameStartRef.current?.({
        initialTiles: allocatedTilesByPlayer.get(currentPeerId) || [],
        remainingBagCount,
      });
      onBagCountUpdateRef.current?.(remainingBagCount);
    }, countdownSeconds * 1000);
  }, [createShuffledBag, currentPeerId, isLobbyHost, syncLobbyPlayers]);

  const requestMultiplayerDraw = useCallback((count, actionType = null) => {
    if (!Number.isFinite(count) || count <= 0) return;

    const requestedCount = Math.floor(count);
    const normalizedActionType = typeof actionType === 'string' ? actionType.trim() : '';

    if (isLobbyHost) {
      if (normalizedActionType === 'peels') {
        const peelResult = processPeelRequest(currentPeerId);

        if (!peelResult.ok) {
          if (peelResult.notification) {
            broadcastNotification(peelResult.notification, currentPeerId);
            broadcastWinState(peelResult.notification);
          }
          return;
        }

        const { dealtTilesByPlayer, remainingBagCount } = peelResult;

        hostConnectionsRef.current.forEach((connection) => {
          if (!connection.open) return;
          connection.send({
            type: 'draw-result',
            tiles: dealtTilesByPlayer.get(connection.peer) || [],
            remainingBagCount,
          });
        });

        onMultiplayerDrawRef.current?.(
          dealtTilesByPlayer.get(currentPeerId) || [],
          remainingBagCount,
        );
        broadcastBagCount();
        broadcastNotification(peelResult.notification, currentPeerId);
        return;
      }

      const drawnTiles = drawFromSharedBag(requestedCount);
      const remainingBagCount = sharedBagRef.current.length;
      onMultiplayerDrawRef.current?.(drawnTiles, remainingBagCount);
      broadcastBagCount();
      return;
    }

    if (!hostConnectionRef.current?.open) return;
    hostConnectionRef.current.send({
      type: 'draw-request',
      count: requestedCount,
      actionType: normalizedActionType || undefined,
    });
  }, [broadcastBagCount, broadcastNotification, broadcastWinState, currentPeerId, drawFromSharedBag, isLobbyHost, processPeelRequest]);

  const requestMultiplayerDump = useCallback((tile) => {
    const tileId = Number(tile?.id);
    const tileLetter = String(tile?.letter || '').trim();

    if (!Number.isFinite(tileId) || !tileLetter) return;

    if (isLobbyHost) {
      const result = processDumpRequest({ id: tileId, letter: tileLetter });

      if (!result.ok) {
        onNotifyRef.current?.(result.reason || 'Unable to dump tile.');
        return;
      }

      onMultiplayerDumpRef.current?.({
        removedTileId: result.removedTileId,
        drawnTiles: result.drawnTiles,
        remainingBagCount: result.remainingBagCount,
      });
      broadcastBagCount();
      broadcastPlayerAction(currentPeerId, 'dumped');
      return;
    }

    if (!hostConnectionRef.current?.open) return;
    hostConnectionRef.current.send({
      type: 'dump-request',
      tile: { id: tileId, letter: tileLetter },
    });
  }, [broadcastBagCount, broadcastPlayerAction, currentPeerId, isLobbyHost, processDumpRequest]);

  const requestMultiplayerBananas = useCallback(() => {
    if (isLobbyHost) {
      const result = processBananasRequest(currentPeerId);

      if (!result.ok) {
        onNotifyRef.current?.(result.reason || 'Bananas is not available right now.');
        return;
      }

      broadcastNotification(result.notification, currentPeerId);
      broadcastWinState(result.notification);
      return;
    }

    if (!hostConnectionRef.current?.open) return;
    hostConnectionRef.current.send({ type: 'bananas-request' });
  }, [broadcastNotification, broadcastWinState, currentPeerId, isLobbyHost, processBananasRequest]);

  const sendBoardSnapshot = useCallback((tiles, tileSize) => {
    // Flatten tile positions for serialization (position: { x, y } -> x, y at root)
    const flattenedTiles = Array.isArray(tiles)
      ? tiles.map((tile) => ({
        id: tile.id,
        letter: tile.letter,
        x: tile.position?.x || 0,
        y: tile.position?.y || 0,
      }))
      : [];

    const snapshot = {
      tiles: flattenedTiles,
      tileSize: Number.isFinite(tileSize) ? tileSize : 60,
    };

    if (isLobbyHost) {
      const playerId = String(currentPeerId || '').trim();
      if (playerId) {
        playerBoardSnapshotsRef.current.set(playerId, snapshot);

        hostConnectionsRef.current.forEach((connection) => {
          if (!connection.open) return;
          connection.send({
            type: 'board-data',
            playerId,
            snapshot,
          });
        });
      }
      return;
    }

    console.log('[Board] User sending board snapshot to host:', snapshot);
    if (!hostConnectionRef.current?.open) return;
    hostConnectionRef.current.send({
      type: 'board-snapshot',
      snapshot,
    });
  }, [currentPeerId, isLobbyHost]);

  const returnToLobby = useCallback(() => {
    if (isLobbyHost) {
      const nextPlayers = lobbyPlayersRef.current.map((player) => (
        player.id === currentPeerId
          ? { ...player, isReady: true, status: READY_STATUS }
          : player
      ));
      syncLobbyPlayers(nextPlayers);
      return;
    }

    if (!hostConnectionRef.current?.open) return;
    hostConnectionRef.current.send({ type: 'return-to-lobby', peerId: currentPeerId });
  }, [currentPeerId, isLobbyHost, syncLobbyPlayers]);

  const leaveLobby = useCallback(() => {
    intentionalLeaveRef.current = true;

    if (isLobbyHost) {
      hostConnectionsRef.current.forEach((connection) => {
        if (!connection.open) return;
        connection.send({ type: 'host-left' });
      });
    }

    cleanupPeerConnections();
    resetMultiplayerState();
  }, [cleanupPeerConnections, isLobbyHost, resetMultiplayerState]);

  useEffect(() => {
    return () => {
      cleanupPeerConnections();
    };
  }, [cleanupPeerConnections]);

  const allPlayersReady = lobbyPlayers.length > 0
    && lobbyPlayers.every(
      (player) => Boolean(player.isReady) && player.status === READY_STATUS,
    );
  const currentPlayer = lobbyPlayers.find((player) => player.id === currentPeerId);
  const currentPlayerReady = Boolean(currentPlayer?.isReady);

  return {
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
    startGame,
    requestMultiplayerDraw,
    requestMultiplayerDump,
    requestMultiplayerBananas,
    sendBoardSnapshot,
    returnToLobby,
    leaveLobby,
  };
}
