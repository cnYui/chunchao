export const createSynthRouter = ({ audioEngine, uiControls }) => {
  return {
    togglePad(index) {
      const currentState = audioEngine.getControlState?.();
      const occupied = currentState?.occupied ?? [];
      const nextActive = !Boolean(occupied[index]);

      if (nextActive) {
        audioEngine.startPadVoice(index);
      } else {
        audioEngine.stopPadVoice(index);
      }

      uiControls.setPadActive?.(index, nextActive);
      return nextActive;
    },
    syncPadStates(states) {
      states.forEach((active, index) => {
        uiControls.setPadActive?.(index, active);
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
