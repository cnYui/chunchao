export const calibrationMarkerLayout = Object.freeze([
  { index: 0, label: '1', anchorX: 'left', anchorY: 'top' },
  { index: 1, label: '2', anchorX: 'right', anchorY: 'top' },
  { index: 2, label: '3', anchorX: 'right', anchorY: 'bottom' },
  { index: 3, label: '4', anchorX: 'left', anchorY: 'bottom' },
]);

export const getCalibrationMarkerState = (markerIndex, completedCount) => {
  if (markerIndex < completedCount) {
    return 'done';
  }

  if (markerIndex === completedCount) {
    return 'current';
  }

  return 'pending';
};
