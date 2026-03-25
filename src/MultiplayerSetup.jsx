import PropTypes from 'prop-types';
import './Multiplayer.css';

export default function MultiplayerSetup({
  mode,
  username,
  roomCode,
  onUsernameChange,
  onRoomCodeChange,
  onCreateRoom,
  onJoinRoom,
  onBack,
  error = '',
}) {
  const isJoinMode = mode === 'join';
  const trimmedName = username.trim();
  const trimmedRoomCode = roomCode.trim();
  const createDisabled = trimmedName.length === 0;
  const joinDisabled = trimmedName.length === 0 || !/^\d{6}$/.test(trimmedRoomCode);

  return (
    <div className="menu-screen">
      <div className="menu-bg" />
      <div className="menu-content multiplayer-card">
        <h1 className="menu-title multiplayer-title">{isJoinMode ? 'JOIN ROOM' : 'CREATE ROOM'}</h1>
        <label className="multiplayer-label" htmlFor="username-input">Username</label>
        <input
          id="username-input"
          className="multiplayer-input"
          value={username}
          onChange={(event) => onUsernameChange(event.target.value)}
          placeholder="Enter username"
          maxLength={20}
        />

        {isJoinMode && (
          <>
            <label className="multiplayer-label" htmlFor="room-code-input">Room Code</label>
            <input
              id="room-code-input"
              className="multiplayer-input"
              value={roomCode}
              onChange={(event) => onRoomCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit room code"
              inputMode="numeric"
              maxLength={6}
            />
          </>
        )}

        {error && <div className="multiplayer-error">{error}</div>}

        <div className="menu-buttons">
          {isJoinMode ? (
            <button className="menu-action-btn" onClick={onJoinRoom} disabled={joinDisabled}>
              Join Room
            </button>
          ) : (
            <button className="menu-action-btn" onClick={onCreateRoom} disabled={createDisabled}>
              Create Room
            </button>
          )}
          <button className="menu-action-btn secondary" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

MultiplayerSetup.propTypes = {
  mode: PropTypes.oneOf(['create', 'join']).isRequired,
  username: PropTypes.string.isRequired,
  roomCode: PropTypes.string.isRequired,
  onUsernameChange: PropTypes.func.isRequired,
  onRoomCodeChange: PropTypes.func.isRequired,
  onCreateRoom: PropTypes.func.isRequired,
  onJoinRoom: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  error: PropTypes.string,
};
