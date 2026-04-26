export const createHandBounds = (points, padding = 0) => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    left: Math.min(...xs) - padding,
    top: Math.min(...ys) - padding,
    right: Math.max(...xs) + padding,
    bottom: Math.max(...ys) + padding,
  };
};

export const mapPointToSliderValue = (point, rect) => {
  const ratio = (rect.bottom - point.y) / (rect.bottom - rect.top);

  return Math.max(0, Math.min(1, Number(ratio.toFixed(4))));
};

export const mapPointToKnobAngle = (point, rect) => {
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.top + rect.bottom) / 2;

  return Math.atan2(point.y - centerY, point.x - centerX);
};
