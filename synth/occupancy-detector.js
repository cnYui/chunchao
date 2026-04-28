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

      const score = computeOccupancyScore(base, sample, scoreWeights);

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
