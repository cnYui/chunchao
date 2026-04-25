export const createSynthRouter = ({ audioEngine, uiControls }) => {
  return {
    applyOccupancyStates(states) {
      states.forEach((state, index) => {
        if (state.transition === 'entered') {
          audioEngine.startPadVoice(index);
        }

        if (state.transition === 'exited') {
          audioEngine.stopPadVoice(index);
        }
      });
    },
    applyHandInput({ knobAngle, sliders }) {
      if (Number.isFinite(knobAngle)) {
        uiControls.setKnobAngle(knobAngle);
        audioEngine.setKnobAngle?.(knobAngle);
      }

      Object.entries(sliders).forEach(([key, value]) => {
        uiControls.setSliderValue(key, value);
        audioEngine.setSliderValue?.(key, value);
      });
    },
  };
};
