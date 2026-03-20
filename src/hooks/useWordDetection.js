import { useMemo } from 'react';
import dictionaryText from '../dictionary.txt?raw';

export function useWordDetection({ tiles, groups, useDictionary, getTileSize }) {
  const words = useMemo(() => {
    const tileSize = getTileSize();
    const expectedDistance = tileSize + 1;
    const alignTolerance = 20;
    const distanceTolerance = 4;
    const minWordLength = 2;

    const groupedTiles = new Map();

    tiles.forEach((tile) => {
      const groupId = groups.get(tile.id);
      if (groupId === undefined) return;

      if (!groupedTiles.has(groupId)) {
        groupedTiles.set(groupId, []);
      }

      groupedTiles.get(groupId).push(tile);
    });

    const findDirectionalNeighbor = (sourceTile, groupTiles, direction) => {
      let bestMatch = null;
      let bestScore = Infinity;

      groupTiles.forEach((candidate) => {
        if (candidate.id === sourceTile.id) return;

        const dx = candidate.position.x - sourceTile.position.x;
        const dy = candidate.position.y - sourceTile.position.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (direction === 'left' || direction === 'right') {
          const correctSide = direction === 'left' ? dx < 0 : dx > 0;
          if (!correctSide) return;
          if (absDy > alignTolerance) return;

          const distanceError = Math.abs(absDx - expectedDistance);
          if (distanceError > distanceTolerance) return;

          const score = distanceError + (absDy * 0.05);
          if (score < bestScore) {
            bestScore = score;
            bestMatch = candidate;
          }
          return;
        }

        const correctSide = direction === 'up' ? dy < 0 : dy > 0;
        if (!correctSide) return;
        if (absDx > alignTolerance) return;

        const distanceError = Math.abs(absDy - expectedDistance);
        if (distanceError > distanceTolerance) return;

        const score = distanceError + (absDx * 0.05);
        if (score < bestScore) {
          bestScore = score;
          bestMatch = candidate;
        }
      });

      return bestMatch;
    };

    const detectedWords = [];

    groupedTiles.forEach((groupTiles, groupId) => {
      groupTiles.forEach((startTile) => {
        const leftNeighbor = findDirectionalNeighbor(startTile, groupTiles, 'left');
        const rightNeighbor = findDirectionalNeighbor(startTile, groupTiles, 'right');

        if (!leftNeighbor && rightNeighbor) {
          const tileIds = [startTile.id];
          const letters = [startTile.letter];
          const seen = new Set([startTile.id]);
          let cursor = startTile;
          let canContinue = true;

          while (canContinue) {
            const next = findDirectionalNeighbor(cursor, groupTiles, 'right');
            if (!next || seen.has(next.id)) {
              canContinue = false;
              continue;
            }

            seen.add(next.id);
            tileIds.push(next.id);
            letters.push(next.letter);
            cursor = next;
          }

          if (tileIds.length >= minWordLength) {
            detectedWords.push({
              groupId,
              direction: 'horizontal',
              tileIds,
              text: letters.join(''),
            });
          }
        }

        const topNeighbor = findDirectionalNeighbor(startTile, groupTiles, 'up');
        const bottomNeighbor = findDirectionalNeighbor(startTile, groupTiles, 'down');

        if (!topNeighbor && bottomNeighbor) {
          const tileIds = [startTile.id];
          const letters = [startTile.letter];
          const seen = new Set([startTile.id]);
          let cursor = startTile;
          let canContinue = true;

          while (canContinue) {
            const next = findDirectionalNeighbor(cursor, groupTiles, 'down');
            if (!next || seen.has(next.id)) {
              canContinue = false;
              continue;
            }

            seen.add(next.id);
            tileIds.push(next.id);
            letters.push(next.letter);
            cursor = next;
          }

          if (tileIds.length >= minWordLength) {
            detectedWords.push({
              groupId,
              direction: 'vertical',
              tileIds,
              text: letters.join(''),
            });
          }
        }
      });
    });

    return detectedWords;
  }, [tiles, groups, getTileSize]);

  const dictionaryWords = useMemo(() => {
    return new Set(
      dictionaryText
        .split(/\r?\n/)
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean),
    );
  }, []);

  const tileDictionaryState = useMemo(() => {
    if (!useDictionary) {
      return new Map();
    }

    const stateByTileId = new Map();

    words.forEach((word) => {
      const isValid = dictionaryWords.has(word.text.toLowerCase());

      word.tileIds.forEach((tileId) => {
        const currentState = stateByTileId.get(tileId);

        if (!isValid) {
          if (currentState !== 'valid') {
            stateByTileId.set(tileId, 'invalid');
          }
          return;
        }

        stateByTileId.set(tileId, 'valid');
      });
    });

    return stateByTileId;
  }, [dictionaryWords, useDictionary, words]);

  return { tileDictionaryState };
}
