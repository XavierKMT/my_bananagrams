import './Menu.css';

export default function Menu({ onStart }) {
  return (
    <div className="menu-screen">
      <div className="menu-bg" />
      <div className="menu-content">
        <h1 className="menu-title">BANANAGRAMS</h1>
        <div className="menu-buttons">
          <button className="menu-action-btn" onClick={onStart}>
            Single Player
          </button>
          <button className="menu-action-btn" onClick={onStart}>
            Create Room
          </button>
          <button className="menu-action-btn" onClick={onStart}>
            Join Room
          </button>
        </div>
      </div>
    </div>
  );
}
