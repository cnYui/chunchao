const createPadState = () => ({
  status: 'empty',
  enterCount: 0,
  exitCount: 0,
  transition: null,
});

const computeScore = (baseline, sample) => {
  return (
    Math.abs(sample.brightness - baseline.brightness) +
    Math.abs(sample.variance - baseline.variance) +
    Math.abs(sample.edgeDensity - baseline.edgeDensity) * 2
  );
};

export const createOccupancyDetector = ({
  padCount,
  enterFrames,
  exitFrames,
  enterThreshold,
  exitThreshold,
  maxHandOverlap = 0.35,
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
      const score = computeScore(base, sample);
      const blockedByHand = (sample.overlapWithHand ?? 0) > maxHandOverlap;

      state.transition = null;

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
      };
    });
  };

  return {
    setBaseline,
    reset,
    update,
  };
};
