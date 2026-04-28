import { previewModes } from './preview-mode.js';

export const shouldAutoCaptureBaselineOnModeChange = ({
  nextPreviewMode,
  baselineReady,
  geometryReady,
}) => {
  return nextPreviewMode === previewModes.run && !baselineReady && geometryReady;
};

