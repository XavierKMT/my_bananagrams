/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react';

function formatElapsedTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function GameTimer({ isRunning = false, resetKey = 0 }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    setElapsedSeconds(0);
  }, [resetKey]);

  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((previousValue) => previousValue + 1);
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRunning, resetKey]);

  return (
    <div className="game-timer" aria-label="Game timer" aria-live="polite">
      <span className="game-timer-value">{formatElapsedTime(elapsedSeconds)}</span>
    </div>
  );
}

export default GameTimer;
