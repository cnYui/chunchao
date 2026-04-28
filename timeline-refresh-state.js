const STORAGE_KEY = 'chunchao:timeline-refresh-state';

const isFiniteInteger = (value) => Number.isInteger(value) && value >= 0;

const parseState = (rawValue) => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (parsed?.mode === 'video' && isFiniteInteger(parsed.segmentIndex)) {
      return {
        mode: 'video',
        segmentIndex: parsed.segmentIndex,
      };
    }

    if (
      parsed?.mode === 'interaction' &&
      isFiniteInteger(parsed.segmentIndex) &&
      isFiniteInteger(parsed.interactionIndex) &&
      isFiniteInteger(parsed.sceneIndex)
    ) {
      return {
        mode: 'interaction',
        segmentIndex: parsed.segmentIndex,
        interactionIndex: parsed.interactionIndex,
        sceneIndex: parsed.sceneIndex,
      };
    }

    if (parsed?.mode === 'final') {
      return {
        mode: 'final',
      };
    }
  } catch {
    return null;
  }

  return null;
};

export const createTimelineRefreshStore = (storage) => {
  const safeStorage = storage ?? null;

  const write = (value) => {
    if (!safeStorage) {
      return;
    }

    safeStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  };

  return {
    read() {
      if (!safeStorage) {
        return null;
      }

      return parseState(safeStorage.getItem(STORAGE_KEY));
    },
    saveVideoSegment(segmentIndex) {
      write({
        mode: 'video',
        segmentIndex,
      });
    },
    saveInteraction({ segmentIndex, interactionIndex, sceneIndex }) {
      write({
        mode: 'interaction',
        segmentIndex,
        interactionIndex,
        sceneIndex,
      });
    },
    saveFinal() {
      write({
        mode: 'final',
      });
    },
    clear() {
      if (!safeStorage) {
        return;
      }

      safeStorage.removeItem(STORAGE_KEY);
    },
  };
};
