const createPadState = () => ({
  status: 'empty',
  enterCount: 0,
  exitCount: 0,
  transition: null,
});

const defaultScoreWeights = {
  brightness: 1,
  variance: 4,
  edgeDensity: 100,
};

export const computeOccupancyScore = (
  baseline,
  sample,
  weights = defaultScoreWeights,
) => {
  return (
    Math.abs((sample.brightness ?? 0) - (baseline.brightness ?? 0)) * weights.brightness +
    Math.abs((sample.variance ?? 0) - (baseline.variance ?? 0)) * weights.variance +
    Math.abs((sample.edgeDensity ?? 0) - (baseline.edgeDensity ?? 0)) * weights.edgeDensity
  );
};

const computeCommonModeScore = (scores) => {
  if (scores.length < 4) {
    return 0;
  }

  const sorted = [...scores].sort((left, right) => left - right);
  const lowerQuartileIndex = Math.floor((sorted.length - 1) * 0.25);
  return sorted[lowerQuartileIndex];
};

export const createOccupancyDetector = ({
  padCount,
  enterFrames,
  exitFrames,
  enterThreshold,
  exitThreshold,
  maxHandOverlap = 0.35,
  minPixelCount = 12,
  scoreWeights = defaultScoreWeights,
}) => {
  const states = Array.from({ length: padCount }, createPadState);
  let baseline = [];

  const setBaseline = (nextBaseline) => {
    baseline = nextBaseline;
  };

  const reset = () => {
    states.forEach((state) => {
      state.status = 'empty';
      state.enterCount = 0;
      state.exitCount = 0;
      state.transition = null;
    });
  };

  const update = (samples) => {
    const rawScores = samples.map((sample, index) => {
      const base = baseline[index];
      const samplePixelCount = sample?.pixelCount ?? Number.POSITIVE_INFINITY;

      if (!base || !sample || samplePixelCount < minPixelCount) {
        return null;
      }

      return computeOccupancyScore(base, sample, scoreWeights);
    });
    const commonModeScore = computeCommonModeScore(rawScores.filter((score) => Number.isFinite(score)));

    return states.map((state, index) => {
      const sample = samples[index];
      const base = baseline[index];
      const blockedByHand = (sample?.overlapWithHand ?? 0) > maxHandOverlap;
      const samplePixelCount = sample?.pixelCount ?? Number.POSITIVE_INFINITY;

      state.transition = null;

      if (!base || !sample) {
        state.enterCount = 0;
        state.exitCount = 0;
        return {
          status: state.status,
          transition: null,
          score: 0,
          reason: 'baseline-missing',
        };
      }

      if (samplePixelCount < minPixelCount) {
        state.enterCount = 0;
        state.exitCount = 0;
        return {
          status: state.status,
          transition: null,
          score: 0,
          reason: 'sample-too-small',
        };
      }

      const rawScore = rawScores[index] ?? 0;
      const score = Math.max(0, Number((rawScore - commonModeScore).toFixed(4)));

      if (state.status === 'empty') {
        if (!blockedByHand && score >= enterThreshold) {
          state.enterCount += 1;
          if (state.enterCount >= enterFrames) {
            state.status = 'occupied';
            state.enterCount = 0;
            state.transition = 'entered';
          }
        } else {
          state.enterCount = 0;
        }
      } else if (!blockedByHand && score <= exitThreshold) {
        state.exitCount += 1;
        if (state.exitCount >= exitFrames) {
          state.status = 'empty';
          state.exitCount = 0;
          state.transition = 'exited';
        }
      } else {
        state.exitCount = 0;
      }

      return {
        status: state.status,
        transition: state.transition,
        score,
        rawScore,
        commonModeScore,
        reason: blockedByHand ? 'hand-overlap' : null,
      };
    });
  };

  return {
    setBaseline,
    reset,
    update,
  };
};
