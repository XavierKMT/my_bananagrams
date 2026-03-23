import PropTypes from 'prop-types';
import './Multiplayer.css';

const MAX_PLAYERS = 4;

export default function Lobby({
  roomCode,
  players,
  isHost,
  currentPeerId,
  currentPlayerReady,
  startEnabled,
  onToggleReady,
  onStartGame,
  onBack,
}) {
  const slots = Array.from({ length: MAX_PLAYERS }, (_, index) => players[index] || null);

  return (
    <div className="menu-screen">
      <div className="menu-bg" />
      <div className="menu-content multiplayer-card">
        <h3 className="menu-title">LOBBY</h3>
        <div className="room-code">Room Code: {roomCode}</div>
        <div className="lobby-note">Share this code to invite players</div>

        <div className="player-slots">
          {slots.map((player, index) => (
            <div key={`slot-${index}`} className="player-slot">
              <span className="player-slot-label">Player {index + 1}</span>
              {player ? (
                <div className="player-slot-meta">
                  <span className="player-slot-name">
                    {`${player.username}${player.isHost ? ' (Host)' : ''}${player.id === currentPeerId ? ' (You)' : ''}`}
                  </span>
                  <span className={`player-ready-badge ${player.isReady ? 'ready' : 'not-ready'}`}>
                    {player.isReady ? 'Ready' : 'Not Ready'}
                  </span>
                </div>
              ) : (
                <span className="player-slot-name">Waiting...</span>
              )}
            </div>
          ))}
        </div>

        <div className="lobby-note">{isHost ? 'Host can start when everyone is ready' : 'Set your status, then wait for host to start'}</div>

        <div className="menu-buttons">
          <button className="menu-action-btn" onClick={onToggleReady}>
            {currentPlayerReady ? 'Unready' : 'Ready'}
          </button>
          <button className="menu-action-btn" onClick={onStartGame} disabled={!startEnabled}>
            Start Game
          </button>
          <button className="menu-action-btn secondary" onClick={onBack}>
            Leave Lobby
          </button>
        </div>
      </div>
    </div>
  );
}

Lobby.propTypes = {
  roomCode: PropTypes.string.isRequired,
  players: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      username: PropTypes.string.isRequired,
      isHost: PropTypes.bool,
      isReady: PropTypes.bool,
    }),
  ).isRequired,
  isHost: PropTypes.bool.isRequired,
  currentPeerId: PropTypes.string.isRequired,
  currentPlayerReady: PropTypes.bool.isRequired,
  startEnabled: PropTypes.bool.isRequired,
  onToggleReady: PropTypes.func.isRequired,
  onStartGame: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
};
