import { useState, useEffect, useCallback, useRef } from 'react';
import Peer from 'peerjs';

export function useMultiplayer({ onEnterLobby, onGameStart, onReturnToMenu, onNotify }) {
  const [multiplayerUsername, setMultiplayerUsername] = useState('');
  const [multiplayerError, setMultiplayerError] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [isLobbyHost, setIsLobbyHost] = useState(false);
  const [currentPeerId, setCurrentPeerId] = useState('');

  const peerRef = useRef(null);
  const hostConnectionRef = useRef(null);
  const hostConnectionsRef = useRef(new Map());
  const lobbyPlayersRef = useRef(lobbyPlayers);
  const onEnterLobbyRef = useRef(onEnterLobby);
  const onGameStartRef = useRef(onGameStart);
  const onReturnToMenuRef = useRef(onReturnToMenu);
  const onNotifyRef = useRef(onNotify);

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

  const cleanupPeerConnections = useCallback(() => {
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
    setCurrentPeerId('');
    setRoomCode('');
    setLobbyPlayers([]);
    lobbyPlayersRef.current = [];
    setIsLobbyHost(false);
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
      const peer = new Peer(nextRoomCode);
      peerRef.current = peer;

      let opened = false;

      peer.on('open', (id) => {
        opened = true;
        const hostPlayer = { id, username: trimmedName, isHost: true, isReady: false };
        setCurrentPeerId(id);
        setRoomCode(id);
        syncLobbyPlayers([hostPlayer]);
        onEnterLobbyRef.current?.();
      });

      peer.on('connection', (connection) => {
        hostConnectionsRef.current.set(connection.peer, connection);

        connection.on('data', (message) => {
          if (!message) return;

          if (message.type === 'ready-toggle') {
            const requestedId = String(message.peerId || connection.peer).trim();
            const isReady = Boolean(message.isReady);
            const nextPlayers = lobbyPlayersRef.current.map((player) => (
              player.id === requestedId ? { ...player, isReady } : player
            ));
            syncLobbyPlayers(nextPlayers);
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
            { id: requestedId, username: requestedName, isHost: false, isReady: false },
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
  }, [cleanupPeerConnections, generateRoomCode, multiplayerUsername, resetMultiplayerState, syncLobbyPlayers]);

  const joinRoom = useCallback(() => {
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

    const peer = new Peer();
    peerRef.current = peer;
    let hasJoinedLobby = false;
    let forceReturnToMainMenu = null;

    peer.on('open', (id) => {
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
          onGameStartRef.current?.();
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
        player.id === currentPeerId ? { ...player, isReady: nextReady } : player
      ));
      syncLobbyPlayers(nextPlayers);
      return;
    }

    const nextPlayers = lobbyPlayersRef.current.map((player) => (
      player.id === currentPeerId ? { ...player, isReady: nextReady } : player
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

    const allReady = lobbyPlayersRef.current.length > 0
      && lobbyPlayersRef.current.every((player) => Boolean(player.isReady));

    if (!allReady) return;

    hostConnectionsRef.current.forEach((connection) => {
      if (!connection.open) return;
      connection.send({ type: 'game-start' });
    });

    onGameStartRef.current?.();
  }, [isLobbyHost]);

  const leaveLobby = useCallback(() => {
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
    && lobbyPlayers.every((player) => Boolean(player.isReady));
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
    leaveLobby,
  };
}
