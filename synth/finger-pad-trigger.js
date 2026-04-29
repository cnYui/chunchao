import { isPointInQuad } from './roi-sampling.js';

const findHoveredPadIndex = (point, padRois) => {
  if (!point) {
    return null;
  }

  const hitIndex = padRois.findIndex((quad) => {
    return Array.isArray(quad) && quad.length >= 4 && isPointInQuad(point, quad);
  });

  return hitIndex >= 0 ? hitIndex : null;
};

export const createFingerPadTrigger = ({
  activateFrames = 3,
} = {}) => {
  let hoveredPadIndex = null;
  let hoverFrames = 0;
  let triggeredWhileHovering = false;

  const reset = () => {
    hoveredPadIndex = null;
    hoverFrames = 0;
    triggeredWhileHovering = false;
  };

  return {
    reset,
    update({ point, padRois = [] }) {
      const nextHoveredPadIndex = findHoveredPadIndex(point, padRois);

      if (!Number.isInteger(nextHoveredPadIndex)) {
        reset();
        return null;
      }

      if (nextHoveredPadIndex !== hoveredPadIndex) {
        hoveredPadIndex = nextHoveredPadIndex;
        hoverFrames = 1;
        triggeredWhileHovering = false;
        return null;
      }

      hoverFrames += 1;
      if (!triggeredWhileHovering && hoverFrames >= activateFrames) {
        triggeredWhileHovering = true;
        return hoveredPadIndex;
      }

      return null;
    },
  };
};
