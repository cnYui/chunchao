const toQuad = (bounds) => {
  return [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom },
  ];
};

export const mapViewportRectToVideoBounds = (rect, viewportSize, videoSize) => {
  const scaleX = videoSize.width / viewportSize.width;
  const scaleY = videoSize.height / viewportSize.height;

  return {
    left: Number((rect.left * scaleX).toFixed(4)),
    top: Number((rect.top * scaleY).toFixed(4)),
    right: Number((rect.right * scaleX).toFixed(4)),
    bottom: Number((rect.bottom * scaleY).toFixed(4)),
  };
};

export const buildViewportGuideGeometry = ({
  viewportSize,
  videoSize,
  stageRect,
  padRects,
  knobRect,
  sliderRects,
}) => {
  return {
    padRois: padRects.map((rect) => {
      return toQuad(mapViewportRectToVideoBounds(rect, viewportSize, videoSize));
    }),
    controlRects: {
      vibe: mapViewportRectToVideoBounds(knobRect, viewportSize, videoSize),
      volume: mapViewportRectToVideoBounds(sliderRects.volume, viewportSize, videoSize),
      reverb: mapViewportRectToVideoBounds(sliderRects.reverb, viewportSize, videoSize),
      position: mapViewportRectToVideoBounds(sliderRects.position, viewportSize, videoSize),
    },
    stageFrameRect: mapViewportRectToVideoBounds(stageRect, viewportSize, videoSize),
  };
};

