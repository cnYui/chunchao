const toBounds = (rect, previewSize, targetSize) => {
  const scaleX = targetSize.width / previewSize.width;
  const scaleY = targetSize.height / previewSize.height;

  return {
    left: Number((rect.x * scaleX).toFixed(4)),
    top: Number((rect.y * scaleY).toFixed(4)),
    right: Number(((rect.x + rect.width) * scaleX).toFixed(4)),
    bottom: Number(((rect.y + rect.height) * scaleY).toFixed(4)),
  };
};

const boundsToQuad = (bounds) => {
  return [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom },
  ];
};

export const mapManualRectToVideoRect = (rect, previewSize, targetSize) => {
  return toBounds(rect, previewSize, targetSize);
};

export const buildRuntimeLayout = (layout, targetSize) => {
  return {
    padRois: layout.pads.map((rect) => {
      return boundsToQuad(toBounds(rect, layout.previewSize, targetSize));
    }),
    controlRects: {
      vibe: toBounds(layout.controls.vibe, layout.previewSize, targetSize),
      volume: toBounds(layout.controls.volume, layout.previewSize, targetSize),
      reverb: toBounds(layout.controls.reverb, layout.previewSize, targetSize),
      position: toBounds(layout.controls.position, layout.previewSize, targetSize),
    },
    consoleFrameRect: toBounds(layout.consoleFrame, layout.previewSize, targetSize),
  };
};

export const resolveActiveGeometrySource = ({ manualLayout, calibrationReady }) => {
  if (manualLayout) {
    return 'manual';
  }

  return calibrationReady ? 'calibration' : 'none';
};

