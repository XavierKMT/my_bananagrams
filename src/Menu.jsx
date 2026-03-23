import PropTypes from 'prop-types';
import './Menu.css';

export default function Menu({ onStartSinglePlayer, onStartCreateRoom, onStartJoinRoom }) {
  return (
    <div className="menu-screen">
      <div className="menu-bg" />
      <div className="menu-content">
        <h1 className="menu-title">BANANAGRAMS</h1>
        <div className="menu-buttons">
          <button className="menu-action-btn" onClick={onStartSinglePlayer}>
            Single Player
          </button>
          <button className="menu-action-btn" onClick={onStartCreateRoom}>
            Create Room
          </button>
          <button className="menu-action-btn" onClick={onStartJoinRoom}>
            Join Room
          </button>
        </div>
      </div>
    </div>
  );
}

Menu.propTypes = {
  onStartSinglePlayer: PropTypes.func.isRequired,
  onStartCreateRoom: PropTypes.func.isRequired,
  onStartJoinRoom: PropTypes.func.isRequired,
};