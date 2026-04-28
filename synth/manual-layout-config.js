const controlStepDefinitions = [
  { id: 'vibe', kind: 'control', label: 'VIBE' },
  { id: 'volume', kind: 'control', label: 'VOL' },
  { id: 'reverb', kind: 'control', label: 'REV' },
  { id: 'position', kind: 'control', label: 'POS' },
];

export const manualLayoutSteps = Object.freeze([
  ...Array.from({ length: 16 }, (_, index) => ({
    id: `pad-${index + 1}`,
    kind: 'pad',
    label: `Pad ${index + 1}`,
  })),
  ...controlStepDefinitions,
  {
    id: 'console-frame',
    kind: 'frame',
    label: '控制台',
  },
]);

export const buildEmptyManualLayoutDraft = () => ({
  version: 1,
  previewSize: null,
  pads: [],
  controls: {},
  consoleFrame: null,
});

const hasPositiveSize = (rect) => {
  return Boolean(rect) && rect.width > 0 && rect.height > 0;
};

export const validateManualLayout = (layout) => {
  if (!layout?.previewSize?.width || !layout?.previewSize?.height) {
    return {
      ok: false,
      reason: 'preview-size-missing',
    };
  }

  if (!Array.isArray(layout.pads) || layout.pads.length !== 16) {
    return {
      ok: false,
      reason: 'pad-count-mismatch',
    };
  }

  if (!layout.pads.every(hasPositiveSize)) {
    return {
      ok: false,
      reason: 'pad-invalid',
    };
  }

  const missingControl = controlStepDefinitions.find((definition) => {
    return !hasPositiveSize(layout.controls?.[definition.id]);
  });

  if (missingControl) {
    return {
      ok: false,
      reason: 'control-missing',
    };
  }

  if (!hasPositiveSize(layout.consoleFrame)) {
    return {
      ok: false,
      reason: 'console-frame-missing',
    };
  }

  return {
    ok: true,
  };
};

