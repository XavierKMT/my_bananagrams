/* eslint-disable react/prop-types */
import { ChevronLeft, ChevronRight, Crown, Trophy } from 'lucide-react';

function MultiplayerPanel({
  multiplayerTabOpen,
  onClose,
  roomCode,
  currentLobbyPlayer,
  multiplayerUsername,
  getPlayerStatusClassName,
  onPreviousSpectatedPlayer,
  onNextSpectatedPlayer,
  spectatablePlayers,
  activeSpectatedPlayer,
  activeSpectatedSnapshot,
  spectatePlayAreaRef,
  isPanningSpectateCamera,
  onSpectatePointerDown,
  onSpectatePointerMove,
  onSpectatePointerUp,
  spectatedBoardTransformStyle,
  normalizedSpectatedTiles,
  multiplayerWinner,
}) {
  const winnerName = typeof multiplayerWinner === 'string'
    ? multiplayerWinner.replace(/\s+has won!?$/i, '').trim()
    : '';
  const isSpectatedWinner = Boolean(
    activeSpectatedPlayer?.username
    && winnerName
    && activeSpectatedPlayer.username.trim().toLowerCase() === winnerName.toLowerCase(),
  );

  return (
    <>
      {multiplayerTabOpen && (
        <div
          className={`multiplayer-panel-overlay${activeSpectatedPlayer ? ' has-spectated-player' : ''}`}
          onClick={onClose}
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
                  onClick={onClose}
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
                  onClick={onPreviousSpectatedPlayer}
                  disabled={spectatablePlayers.length <= 1}
                  aria-label="View previous player"
                >
                  <ChevronLeft aria-hidden="true" />
                </button>

                <div className="multiplayer-carousel-title-wrap">
                  <p className="multiplayer-panel-eyebrow">Spectating</p>
                  <h3 className="multiplayer-carousel-title">
                    {activeSpectatedPlayer ? (
                      <span className="multiplayer-carousel-player-name">
                        <span>{activeSpectatedPlayer.username}</span>
                        {isSpectatedWinner && (
                          <Trophy
                            size={16}
                            aria-label="Winner"
                            className="multiplayer-winner-icon"
                          />
                        )}
                        {activeSpectatedPlayer.isHost && <Crown size={16} aria-label="Host" />}
                      </span>
                    ) : 'No Other Players In Game'}
                  </h3>
                </div>

                <button
                  className="multiplayer-carousel-nav"
                  onClick={onNextSpectatedPlayer}
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
                    onPointerDown={onSpectatePointerDown}
                    onPointerMove={onSpectatePointerMove}
                    onPointerUp={onSpectatePointerUp}
                    onPointerCancel={onSpectatePointerUp}
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
                    Couldn&apos;t load board...
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default MultiplayerPanel;
