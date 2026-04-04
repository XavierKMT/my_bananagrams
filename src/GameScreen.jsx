/* eslint-disable react/prop-types */
import { Users } from 'lucide-react';
import Tile from './Tile';
import MultiplayerPanel from './MultiplayerPanel';
import GameTimer from './GameTimer';

function GameScreen({
  gameMode,
  multiplayerTabOpen,
  onOpenMultiplayerPanel,
  onCloseMultiplayerPanel,
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
  menuOpen,
  onToggleMenu,
  onFitToTiles,
  useDictionary,
  onToggleUseDictionary,
  onClearBoard,
  onExit,
  multiplayerWinner,
  onReturnToLobby,
  singlePlayerWon,
  showSinglePlayerGameTypePicker,
  onSelectShortGame,
  onSelectLongGame,
  bagTileCount,
  hasUngroupedTiles,
  dumpMode,
  onToggleDumpMode,
  showPeelButton,
  onPeel,
  showBananasButton,
  onBananas,
  playAreaRef,
  isPanningCamera,
  onPlayAreaPointerDown,
  onPlayAreaPointerMove,
  onPlayAreaPointerUp,
  isTimerRunning,
  timerResetKey,
  boardTransformStyle,
  tiles,
  groups,
  groupedBorderSides,
  tileDictionaryState,
  onTilePositionChange,
  onUngroupTile,
  onRegisterTileElement,
  screenToBoard,
  onDumpSelect,
}) {
  return (
    <div className="game-container">
      {gameMode === 'multiplayer' && (
        <MultiplayerPanel
          multiplayerTabOpen={multiplayerTabOpen}
          onOpen={onOpenMultiplayerPanel}
          onClose={onCloseMultiplayerPanel}
          roomCode={roomCode}
          currentLobbyPlayer={currentLobbyPlayer}
          multiplayerUsername={multiplayerUsername}
          getPlayerStatusClassName={getPlayerStatusClassName}
          onPreviousSpectatedPlayer={onPreviousSpectatedPlayer}
          onNextSpectatedPlayer={onNextSpectatedPlayer}
          spectatablePlayers={spectatablePlayers}
          activeSpectatedPlayer={activeSpectatedPlayer}
          activeSpectatedSnapshot={activeSpectatedSnapshot}
          spectatePlayAreaRef={spectatePlayAreaRef}
          isPanningSpectateCamera={isPanningSpectateCamera}
          onSpectatePointerDown={onSpectatePointerDown}
          onSpectatePointerMove={onSpectatePointerMove}
          onSpectatePointerUp={onSpectatePointerUp}
          spectatedBoardTransformStyle={spectatedBoardTransformStyle}
          normalizedSpectatedTiles={normalizedSpectatedTiles}
        />
      )}

      <div className="controls">
        <div className="controls-left">
          <button
            className={`burger-btn${menuOpen ? ' open' : ''}`}
            onClick={onToggleMenu}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <span />
            <span />
            <span />
          </button>

          {gameMode === 'multiplayer' && (
            <button
              className={`multiplayer-tab${multiplayerTabOpen ? ' open' : ''}`}
              onClick={onOpenMultiplayerPanel}
              aria-label="Open multiplayer player list"
            >
              <Users className="multiplayer-tab-icon" aria-hidden="true" strokeWidth={2.1} />
            </button>
          )}

          <div className={`burger-menu${menuOpen ? ' open' : ''}`}>
            <button className="btn" onClick={onFitToTiles}>
              Fit to Tiles
            </button>
            <label className="dictionary-toggle">
              <input
                type="checkbox"
                checked={useDictionary}
                onChange={(event) => onToggleUseDictionary(event.target.checked)}
              />
              <span>Use Dictionary</span>
            </label>
            {gameMode !== 'multiplayer' && (
              <button className="btn" onClick={onClearBoard}>
                RESTART
              </button>
            )}
            <button className="btn" onClick={onExit}>
              Exit
            </button>
          </div>
        </div>

        <div className="controls-status">
          {gameMode === 'multiplayer' && multiplayerWinner ? (
            <button className="btn" onClick={onReturnToLobby}>
              Return to Lobby
            </button>
          ) : (
            <div className="bag-info">
              {singlePlayerWon ? 'You win' : `Tiles in bag: ${bagTileCount}`}
            </div>
          )}
        </div>

        <div className="controls-right">
          <GameTimer isRunning={isTimerRunning} resetKey={timerResetKey} />

          <div className="controls-actions">
            {(hasUngroupedTiles || dumpMode) && (
              <button
                className={`btn ${dumpMode ? 'dump-mode-active' : ''}`.trim()}
                onClick={onToggleDumpMode}
                disabled={bagTileCount < 3 || Boolean(multiplayerWinner)}
              >
                {dumpMode ? 'Cancel Dump' : 'DUMP'}
              </button>
            )}
            {showPeelButton && !multiplayerWinner && (
              <button className="btn" onClick={onPeel}>
                PEEL
              </button>
            )}
            {showBananasButton && !multiplayerWinner && (
              <button className="btn" onClick={onBananas}>
                BANANAS
              </button>
            )}
          </div>
        </div>
      </div>

      {gameMode === 'singlePlayer' && showSinglePlayerGameTypePicker && (
        <div className="singleplayer-mode-overlay" role="dialog" aria-modal="true" aria-label="Choose game type">
          <div className="singleplayer-mode-card">
            <h3>Choose Your Game</h3>
            <div className="singleplayer-mode-actions">
              <button className="btn singleplayer-mode-btn" onClick={onSelectShortGame}>
                <span className="singleplayer-mode-btn-title">SHORT</span>
                <span className="singleplayer-mode-btn-description">Fast paced • No peels</span>
              </button>
              <button className="btn singleplayer-mode-btn" onClick={onSelectLongGame}>
                <span className="singleplayer-mode-btn-title">LONG</span>
                <span className="singleplayer-mode-btn-description">Classic game • Peel all tiles</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="hero-copy">
        <h1 className="game-title">BANANAGRAMS</h1>
        <div className="instructions">
          Drag tiles to build your crossword • Long press to ungroup tiles
        </div>
      </div>

      <div
        ref={playAreaRef}
        className={`play-area ${isPanningCamera ? 'camera-panning' : ''}`}
        onPointerDown={onPlayAreaPointerDown}
        onPointerMove={onPlayAreaPointerMove}
        onPointerUp={onPlayAreaPointerUp}
        onPointerCancel={onPlayAreaPointerUp}
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
              onPositionChange={onTilePositionChange}
              onUngroup={onUngroupTile}
              onRegisterElement={onRegisterTileElement}
              screenToBoard={screenToBoard}
              dumpMode={dumpMode}
              onDumpSelect={onDumpSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default GameScreen;
