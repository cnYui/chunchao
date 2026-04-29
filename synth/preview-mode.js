export const previewModes = Object.freeze({
  align: 'align',
  run: 'run',
});

export const resolvePreviewPresentation = (mode) => {
  if (mode === previewModes.run) {
    return {
      showCameraFeed: false,
      showGuideOverlay: false,
      showDebugOverlay: false,
      allowFingerInput: true,
    };
  }

  return {
    showCameraFeed: true,
    showGuideOverlay: true,
    showDebugOverlay: true,
    allowFingerInput: false,
  };
};

export const togglePreviewMode = (mode) => {
  return mode === previewModes.run ? previewModes.align : previewModes.run;
};
