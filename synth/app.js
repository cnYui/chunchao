import {
  defaultControlState,
  getVibeIndexFromAngle,
} from './audio-engine.js';
import { createBrowserStrudelRuntime } from './strudel-browser.js';
import { calibrationMarkerLayout, getCalibrationMarkerState } from './calibration-markers.js';
import { createCameraController } from './camera-controller.js';
import { createDebugOverlay } from './debug-overlay.js';
import { createHandController } from './hand-controller.js';
import { createHandBounds, mapPointToKnobAngle, mapPointToSliderValue } from './hand-math.js';
import {
  buildEmptyManualLayoutDraft,
  manualLayoutSteps,
  validateManualLayout,
} from './manual-layout-config.js';
import {
  buildRuntimeLayout,
  resolveActiveGeometrySource,
} from './manual-layout-runtime.js';
import {
  loadManualLayout,
  saveManualLayout,
} from './manual-layout-storage.js';
import { createOccupancyDetector } from './occupancy-detector.js';
import {
  previewModes,
  resolvePreviewPresentation,
  togglePreviewMode,
} from './preview-mode.js';
import { createProjectiveTransform, mapDomRectToQuad } from './projection-calibration.js';
import { computeMaskedFeatureFromImageData, getQuadBounds } from './roi-sampling.js';
import { shouldAutoCaptureBaselineOnModeChange } from './roi-runtime-flow.js';
import { getGridCellPatternKey, gridPatternKeys } from './strudel-score.js';
import { createSynthRouter } from './synth-router.js';
import { createUiControls } from './ui-controls.js';
import { buildViewportGuideGeometry } from './viewport-guide.js';

const padCount = gridPatternKeys.length;

const calibrationOrder = ['左上', '右上', '右下', '左下'];
const sliderKeys = ['volume', 'reverb', 'position'];
const minimumLayoutRectSize = 12;

const uiControls = createUiControls(document);
const cameraMonitorPanel = document.querySelector('#camera-monitor-panel');
const cameraPreview = document.querySelector('#synth-camera-preview');
const debugCanvas = document.querySelector('#synth-debug-canvas');
const calibrationLayer = document.querySelector('#synth-calibration-layer');
const handPreviewPanel = document.querySelector('#synth-hand-preview-panel');
const handPreviewVideo = document.querySelector('#synth-hand-preview-video');
const handPreviewOverlay = document.querySelector('#synth-hand-preview-overlay');
const handPreviewContext = handPreviewOverlay?.getContext('2d');

const handConnections = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
const handColors = {
  Left: {
    stroke: 'rgba(255, 182, 120, 0.9)',
    fill: 'rgba(255, 236, 213, 0.96)',
  },
  Right: {
    stroke: 'rgba(118, 220, 255, 0.92)',
    fill: 'rgba(221, 247, 255, 0.98)',
  },
  Unknown: {
    stroke: 'rgba(255, 246, 230, 0.88)',
    fill: 'rgba(255, 255, 255, 0.98)',
  },
};

const strudelRuntime = createBrowserStrudelRuntime();
const strudelAdapter = {
  startPadVoice(index) {
    return strudelRuntime.setOccupied(index, true);
  },
  stopPadVoice(index) {
    return strudelRuntime.setOccupied(index, false);
  },
  stopAllVoices() {
    return Promise.all(Array.from({ length: padCount }, (_, index) => {
      return strudelRuntime.setOccupied(index, false);
    }));
  },
  setKnobAngle(angle) {
    return strudelRuntime.setVibeByIndex(getVibeIndexFromAngle(angle));
  },
  setSliderValue(key, value) {
    return strudelRuntime.setControlValue?.(key, value);
  },
  getActiveVoiceIds() {
    return strudelRuntime.getState().occupied
      .map((active, index) => (active ? index : null))
      .filter(Number.isInteger);
  },
  getControlState() {
    return strudelRuntime.getState();
  },
};
const router = createSynthRouter({
  audioEngine: strudelAdapter,
  uiControls,
});
const cameraController = createCameraController({
  videoElement: cameraPreview,
  width: 960,
  height: 540,
});
const handController = createHandController();
const debugOverlay = createDebugOverlay({ canvas: debugCanvas });
const occupancyDetector = createOccupancyDetector({
  padCount,
  enterFrames: 10,
  exitFrames: 8,
  enterThreshold: 18,
  exitThreshold: 8,
  maxHandOverlap: 0.38,
});

const analysisCanvas = document.createElement('canvas');
const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
const storedManualLayout = loadManualLayout();
const validatedStoredManualLayout = validateManualLayout(storedManualLayout).ok
  ? storedManualLayout
  : null;

const state = {
  cameraReady: false,
  handReady: false,
  debugVisible: true,
  status: '等待摄像头',
  calibrationPoints: [],
  calibrationTransform: null,
  padRois: [],
  knobRect: null,
  sliderRects: {},
  baselineReady: false,
  manualLayout: validatedStoredManualLayout,
  runtimeManualLayout: null,
  useViewportGuide: true,
  previewMode: previewModes.align,
  layoutMode: false,
  layoutStepIndex: 0,
  manualLayoutDraft: buildEmptyManualLayoutDraft(),
  layoutDrawingRect: null,
  layoutPointerStart: null,
  occupancyStates: Array.from({ length: padCount }, () => ({
    status: 'empty',
    transition: null,
  })),
  loopStarted: false,
};

const ui = {};

const getRectCorners = (rect) => {
  return [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ];
};

const getPreviewDisplaySize = () => {
  const rect = calibrationLayer.getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
  };
};

const getViewportSize = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

const mapRectToTargetSize = (rect, sourceSize, targetSize) => {
  const scaleX = targetSize.width / sourceSize.width;
  const scaleY = targetSize.height / sourceSize.height;

  return {
    left: rect.x * scaleX,
    top: rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
  };
};

const getCurrentLayoutStep = () => {
  return manualLayoutSteps[state.layoutStepIndex] ?? null;
};

const isValidLayoutRect = (rect) => {
  return Boolean(rect) && rect.width >= minimumLayoutRectSize && rect.height >= minimumLayoutRectSize;
};

const createLayoutItem = (step, rect) => ({
  id: step.id,
  label: step.label,
  x: Number(rect.x.toFixed(2)),
  y: Number(rect.y.toFixed(2)),
  width: Number(rect.width.toFixed(2)),
  height: Number(rect.height.toFixed(2)),
});

const buildDraftWithPreviewSize = () => {
  const previewSize = getPreviewDisplaySize();
  return {
    ...buildEmptyManualLayoutDraft(),
    previewSize: {
      width: Math.max(1, Math.round(previewSize.width)),
      height: Math.max(1, Math.round(previewSize.height)),
    },
  };
};

const getLayoutItems = (layout) => {
  if (!layout) {
    return [];
  }

  return [
    ...(layout.pads ?? []),
    ...Object.values(layout.controls ?? {}),
    ...(layout.consoleFrame ? [layout.consoleFrame] : []),
  ];
};

const applyRectToDraft = (draft, step, rect) => {
  const item = createLayoutItem(step, rect);

  if (step.kind === 'pad') {
    draft.pads = [...draft.pads, item];
    return;
  }

  if (step.kind === 'control') {
    draft.controls = {
      ...draft.controls,
      [step.id]: item,
    };
    return;
  }

  draft.consoleFrame = item;
};

const removeLastRectFromDraft = (draft, step) => {
  if (!step) {
    return;
  }

  if (step.kind === 'pad') {
    draft.pads = draft.pads.slice(0, -1);
    return;
  }

  if (step.kind === 'control') {
    const nextControls = { ...draft.controls };
    delete nextControls[step.id];
    draft.controls = nextControls;
    return;
  }

  draft.consoleFrame = null;
};

const getActiveGeometry = () => {
  if (state.useViewportGuide && state.cameraReady && cameraPreview.videoWidth && cameraPreview.videoHeight) {
    const geometry = buildViewportGuideGeometry({
      viewportSize: getViewportSize(),
      videoSize: {
        width: cameraPreview.videoWidth,
        height: cameraPreview.videoHeight,
      },
      stageRect: uiControls.getStageRect(),
      padRects: uiControls.getPadElements().map((element) => element.getBoundingClientRect()),
      knobRect: uiControls.getKnobRect(),
      sliderRects: Object.fromEntries(sliderKeys.map((key) => [key, uiControls.getSliderRect(key)])),
    });

    return {
      source: 'viewport',
      padRois: geometry.padRois,
      vibeRect: geometry.controlRects.vibe,
      sliderRects: {
        volume: geometry.controlRects.volume,
        reverb: geometry.controlRects.reverb,
        position: geometry.controlRects.position,
      },
      controlRects: [
        geometry.controlRects.vibe,
        geometry.controlRects.volume,
        geometry.controlRects.reverb,
        geometry.controlRects.position,
      ].filter(Boolean),
      stageFrameRect: geometry.stageFrameRect,
    };
  }

  const source = resolveActiveGeometrySource({
    manualLayout: state.runtimeManualLayout,
    calibrationReady: state.padRois.length === padCount,
  });

  if (source === 'manual') {
    return {
      source,
      padRois: state.runtimeManualLayout?.padRois ?? [],
      vibeRect: state.runtimeManualLayout?.controlRects?.vibe ?? null,
      sliderRects: {
        volume: state.runtimeManualLayout?.controlRects?.volume ?? null,
        reverb: state.runtimeManualLayout?.controlRects?.reverb ?? null,
        position: state.runtimeManualLayout?.controlRects?.position ?? null,
      },
      controlRects: Object.values(state.runtimeManualLayout?.controlRects ?? {}).filter(Boolean),
    };
  }

  if (source === 'calibration') {
    return {
      source,
      padRois: state.padRois,
      vibeRect: state.knobRect,
      sliderRects: state.sliderRects,
      controlRects: [
        state.knobRect,
        ...sliderKeys.map((key) => state.sliderRects[key]),
      ].filter(Boolean),
      stageFrameRect: null,
    };
  }

  return {
    source,
    padRois: [],
    vibeRect: null,
    sliderRects: {},
    controlRects: [],
    stageFrameRect: null,
  };
};

const getPreviewPresentation = () => {
  return resolvePreviewPresentation(state.previewMode);
};

const expandRect = (rect, xPadding, yPadding = xPadding) => {
  return {
    left: rect.left - xPadding,
    top: rect.top - yPadding,
    right: rect.right + xPadding,
    bottom: rect.bottom + yPadding,
  };
};

const isPointInRect = (point, rect) => {
  return (
    point &&
    rect &&
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
};

const getControlPoint = (handState) => {
  if (!handState?.active) {
    return null;
  }

  if (handState.controlPoint) {
    return handState.controlPoint;
  }

  return handState.points[8] ?? handState.points[4] ?? handState.points[0] ?? null;
};

const averageFeatures = (frames) => {
  if (!frames.length) {
    return [];
  }

  return frames[0].map((_, index) => {
    const totals = frames.reduce((accumulator, frame) => {
      const sample = frame[index];
      accumulator.brightness += sample.brightness;
      accumulator.variance += sample.variance;
      accumulator.edgeDensity += sample.edgeDensity;
      accumulator.overlapWithHand += sample.overlapWithHand;
      return accumulator;
    }, {
      brightness: 0,
      variance: 0,
      edgeDensity: 0,
      overlapWithHand: 0,
    });

    return {
      brightness: Number((totals.brightness / frames.length).toFixed(4)),
      variance: Number((totals.variance / frames.length).toFixed(4)),
      edgeDensity: Number((totals.edgeDensity / frames.length).toFixed(4)),
      overlapWithHand: Number((totals.overlapWithHand / frames.length).toFixed(4)),
    };
  });
};

const computeFeatureForQuad = (video, quad, handBounds) => {
  const bounds = getQuadBounds(quad);
  const left = Math.max(0, Math.floor(bounds.left));
  const top = Math.max(0, Math.floor(bounds.top));
  const width = Math.max(8, Math.min(video.videoWidth - left, Math.ceil(bounds.right - left)));
  const height = Math.max(8, Math.min(video.videoHeight - top, Math.ceil(bounds.bottom - top)));

  analysisCanvas.width = width;
  analysisCanvas.height = height;
  analysisContext.drawImage(video, left, top, width, height, 0, 0, width, height);

  const { data } = analysisContext.getImageData(0, 0, width, height);
  return computeMaskedFeatureFromImageData({
    data,
    width,
    height,
    offsetX: left,
    offsetY: top,
    quad,
    handBounds,
  });
};

const samplePadFeatures = (video, rois, handBounds) => {
  return rois.map((quad) => computeFeatureForQuad(video, quad, handBounds));
};

const buildWaveform = (now = performance.now()) => {
  const activeCount = state.occupancyStates.filter((item) => item.status === 'occupied').length;

  return Uint8Array.from({ length: 16 }, (_, index) => {
    const base = activeCount > 0 ? 46 : 12;
    const pulse = Math.sin(now / 180 + index * 0.65 + activeCount * 0.25);
    const accent = activeCount * 14 + (index % 4) * 6;
    return Math.max(8, Math.min(255, Math.round(base + accent + (pulse + 1) * 28)));
  });
};

const setStatus = (text) => {
  state.status = text;
  if (ui.statusText) {
    ui.statusText.textContent = text;
  }
};

const renderLayoutOverlay = () => {
  if (!ui.layoutSurface) {
    return;
  }

  ui.layoutSurface.replaceChildren();
  const previewPresentation = getPreviewPresentation();
  const viewportGuideItems = !state.layoutMode && state.useViewportGuide
    && previewPresentation.showGuideOverlay
    ? [
      {
        id: 'guide-stage',
        label: '控制台',
        rect: uiControls.getStageRect(),
        style: 'stage',
      },
      ...uiControls.getPadElements().map((element, index) => ({
        id: `guide-pad-${index + 1}`,
        label: `Pad ${index + 1}`,
        rect: element.getBoundingClientRect(),
        style: 'guide',
      })),
      {
        id: 'guide-vibe',
        label: 'VIBE',
        rect: uiControls.getKnobRect(),
        style: 'control',
      },
      ...sliderKeys.map((key) => ({
        id: `guide-${key}`,
        label: key === 'volume' ? 'VOL' : key === 'reverb' ? 'REV' : 'POS',
        rect: uiControls.getSliderRect(key),
        style: 'control',
      })),
    ].filter((item) => item.rect)
    : [];
  const targetSize = getPreviewDisplaySize();
  const draftRects = state.layoutMode
    ? getLayoutItems(state.manualLayoutDraft).map((item) => ({
      item,
      style: 'draft',
      sourceSize: state.manualLayoutDraft.previewSize,
    }))
    : [];
  const savedRects = !state.layoutMode && state.manualLayout
    ? getLayoutItems(state.manualLayout).map((item) => ({
      item,
      style: 'saved',
      sourceSize: state.manualLayout.previewSize,
    }))
    : [];
  const currentRect = state.layoutMode && state.layoutDrawingRect && state.manualLayoutDraft.previewSize
    ? [{
      item: {
        id: 'current-drawing',
        label: getCurrentLayoutStep()?.label ?? '当前区域',
        ...state.layoutDrawingRect,
      },
      style: 'current',
      sourceSize: state.manualLayoutDraft.previewSize,
    }]
    : [];

  const overlayItems = [
    ...viewportGuideItems.map(({ id, label, rect, style }) => ({
      item: {
        id,
        label,
        left: rect.left,
        top: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
      },
      style,
      sourceSize: null,
    })),
    ...savedRects,
    ...draftRects,
    ...currentRect,
  ];

  overlayItems.forEach(({ item, style, sourceSize }) => {
    if (!item) {
      return;
    }

    if (!sourceSize) {
      sourceSize = null;
    }

    const overlayRect = sourceSize
      ? mapRectToTargetSize(item, sourceSize, targetSize)
      : {
        left: item.left,
        top: item.top,
        width: item.width,
        height: item.height,
      };
    const box = document.createElement('div');
    box.dataset.layoutItemId = item.id;
    Object.assign(box.style, {
      position: 'absolute',
      left: `${overlayRect.left}px`,
      top: `${overlayRect.top}px`,
      width: `${overlayRect.width}px`,
      height: `${overlayRect.height}px`,
      borderRadius: '6px',
      border: '1px solid rgba(110, 241, 255, 0.82)',
      background: 'rgba(38, 190, 222, 0.06)',
      boxShadow: 'inset 0 0 0 1px rgba(18, 46, 50, 0.24)',
      pointerEvents: 'none',
    });

    if (style === 'stage') {
      box.style.borderColor = 'rgba(255, 244, 178, 0.88)';
      box.style.background = 'rgba(255, 244, 178, 0.04)';
      box.style.boxShadow = '0 0 0 1px rgba(62, 42, 0, 0.3), inset 0 0 0 1px rgba(255, 244, 178, 0.12)';
    }

    if (style === 'guide') {
      box.style.borderColor = 'rgba(94, 214, 208, 0.92)';
      box.style.background = 'rgba(94, 214, 208, 0.08)';
    }

    if (style === 'control') {
      box.style.borderColor = 'rgba(255, 167, 122, 0.92)';
      box.style.background = 'rgba(255, 140, 76, 0.08)';
      box.style.borderStyle = 'dashed';
    }

    if (style === 'saved') {
      box.style.borderColor = 'rgba(110, 241, 255, 0.58)';
      box.style.background = 'rgba(38, 190, 222, 0.04)';
    }

    if (style === 'draft') {
      box.style.borderColor = 'rgba(255, 213, 94, 0.9)';
      box.style.background = 'rgba(255, 213, 94, 0.08)';
    }

    if (style === 'current') {
      box.style.borderColor = 'rgba(255, 244, 178, 0.98)';
      box.style.background = 'rgba(255, 231, 120, 0.14)';
      box.style.boxShadow = '0 0 0 1px rgba(70, 46, 0, 0.38), 0 0 18px rgba(255, 215, 82, 0.32)';
    }

    const label = document.createElement('div');
    label.textContent = item.label;
    Object.assign(label.style, {
      position: 'absolute',
      left: '0',
      top: '-18px',
      padding: '2px 6px',
      borderRadius: '999px',
      background: style === 'saved' ? 'rgba(15, 32, 36, 0.78)' : 'rgba(56, 35, 0, 0.86)',
      color: style === 'saved' ? '#b6f8ff' : '#fff1b5',
      fontSize: '10px',
      lineHeight: '1',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
    });

    box.append(label);
    ui.layoutSurface.append(box);
  });
};

const updateUiState = () => {
  const activeGeometry = getActiveGeometry();
  const previewPresentation = getPreviewPresentation();
  const currentStep = getCurrentLayoutStep();
  const layoutComplete = state.layoutStepIndex >= manualLayoutSteps.length;
  const showCalibrationGuides = !state.useViewportGuide && !state.layoutMode && !state.manualLayout;

  if (ui.baselineButton) {
    ui.baselineButton.disabled = !state.cameraReady
      || state.layoutMode
      || !previewPresentation.allowBaselineCapture
      || activeGeometry.padRois.length !== padCount;
  }

  if (ui.debugButton) {
    ui.debugButton.textContent = state.debugVisible ? '隐藏调试' : '显示调试';
  }

  if (ui.previewModeButton) {
    ui.previewModeButton.style.display = state.useViewportGuide ? 'inline-flex' : 'none';
    ui.previewModeButton.textContent = state.previewMode === previewModes.align ? '进入运行' : '回到对位';
    ui.previewModeButton.disabled = !state.cameraReady;
  }

  if (ui.layoutButton) {
    ui.layoutButton.style.display = 'none';
    ui.layoutButton.disabled = true;
  }

  if (ui.undoLayoutButton) {
    ui.undoLayoutButton.style.display = 'none';
    ui.undoLayoutButton.disabled = state.layoutStepIndex === 0;
  }

  if (ui.redrawLayoutButton) {
    ui.redrawLayoutButton.style.display = 'none';
    ui.redrawLayoutButton.disabled = !state.layoutDrawingRect;
  }

  if (ui.clearLayoutButton) {
    ui.clearLayoutButton.style.display = 'none';
    ui.clearLayoutButton.disabled = state.layoutStepIndex === 0 && !state.layoutDrawingRect;
  }

  if (ui.saveLayoutButton) {
    ui.saveLayoutButton.style.display = 'none';
    ui.saveLayoutButton.disabled = !layoutComplete;
  }

  if (ui.exitLayoutButton) {
    ui.exitLayoutButton.style.display = 'none';
  }

  if (ui.hintText) {
    if (state.useViewportGuide && state.cameraReady) {
      if (state.previewMode === previewModes.align) {
        ui.hintText.textContent = '对位模式：调整摄像头，让半透明画面和触发框与下方合成器重合；完成后切到运行模式';
      } else {
        ui.hintText.textContent = state.baselineReady
          ? '运行模式：ROI 已启动，遮挡右侧 16 格会直接触发声音'
          : '运行模式：正在等待空场完成，未完成前 16 格不会发声';
      }
    } else if (state.layoutMode) {
      ui.hintText.textContent = currentStep
        ? `请绘制 ${currentStep.label}`
        : '全部区域已完成，可点击保存布局';
    } else if (!state.cameraReady) {
      ui.hintText.textContent = '先启用摄像头';
    } else if (state.manualLayout) {
      ui.hintText.textContent = state.baselineReady
        ? '运行中：手工布局已生效，方块占格发声，手指调节旋钮和滑杆'
        : '手工布局已加载，保持 16 格为空后点击采集空场';
    } else if (state.calibrationPoints.length < 4) {
      ui.hintText.textContent = `请在右下预览中依次点击 ${calibrationOrder[state.calibrationPoints.length]}`;
    } else if (!state.baselineReady) {
      ui.hintText.textContent = '标定完成，保持 16 格为空后点击采集空场';
    } else {
      ui.hintText.textContent = '运行中：方块占格发声，手指调节旋钮和滑杆';
    }
  }

  if (ui.progressText) {
    if (state.useViewportGuide) {
      ui.progressText.textContent = state.previewMode === previewModes.align ? '对位模式' : '运行模式';
    } else if (state.layoutMode) {
      ui.progressText.textContent = `${Math.min(state.layoutStepIndex, manualLayoutSteps.length)} / ${manualLayoutSteps.length}`;
    } else if (state.manualLayout) {
      ui.progressText.textContent = '手工布局已保存';
    } else {
      ui.progressText.textContent = `角点 ${state.calibrationPoints.length} / 4`;
    }
  }

  if (ui.pointRow) {
    ui.pointRow.style.display = showCalibrationGuides ? 'flex' : 'none';
    ui.pointRow.querySelectorAll('[data-point-index]').forEach((element) => {
      const index = Number(element.dataset.pointIndex);
      const isDone = index < state.calibrationPoints.length;
      element.style.opacity = isDone ? '1' : '0.42';
      element.style.borderColor = isDone ? 'rgba(255, 164, 132, 0.88)' : 'rgba(255, 164, 132, 0.22)';
      element.style.background = isDone ? 'rgba(139, 36, 22, 0.78)' : 'rgba(15, 10, 12, 0.72)';
    });
  }

  if (ui.cornerMarkers) {
    ui.cornerMarkers.forEach(({ index, element }) => {
      element.style.display = showCalibrationGuides ? 'grid' : 'none';
      const markerState = getCalibrationMarkerState(index, state.calibrationPoints.length);
      const markerStyles = {
        done: {
          opacity: '1',
          background: 'rgba(194, 255, 142, 0.92)',
          borderColor: 'rgba(233, 255, 209, 0.96)',
          boxShadow: '0 0 0 1px rgba(19, 28, 12, 0.48), 0 0 14px rgba(194, 255, 142, 0.42)',
          color: '#1f2d12',
        },
        current: {
          opacity: '1',
          background: 'rgba(255, 229, 93, 0.96)',
          borderColor: 'rgba(255, 248, 187, 0.98)',
          boxShadow: '0 0 0 1px rgba(51, 37, 0, 0.42), 0 0 16px rgba(255, 216, 87, 0.52)',
          color: '#2b2000',
        },
        pending: {
          opacity: '0.56',
          background: 'rgba(255, 215, 64, 0.58)',
          borderColor: 'rgba(255, 242, 176, 0.72)',
          boxShadow: '0 0 0 1px rgba(54, 40, 0, 0.32)',
          color: '#332600',
        },
      }[markerState];

      Object.assign(element.style, markerStyles);
    });
  }

  renderLayoutOverlay();
};

const stylePreviewElements = () => {
  if (!cameraMonitorPanel) {
    return;
  }

  const previewPresentation = getPreviewPresentation();
  const sharedStyle = {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    borderRadius: '10px',
  };

  Object.assign(cameraPreview.style, sharedStyle, {
    zIndex: '30',
    display: state.cameraReady && previewPresentation.showCameraFeed ? 'block' : 'none',
    objectFit: 'fill',
    border: '0',
    background: 'transparent',
    boxShadow: 'inset 0 0 0 1px rgba(255, 160, 126, 0.14)',
    opacity: state.useViewportGuide && previewPresentation.showCameraFeed ? '0.46' : '1',
    cursor: state.layoutMode ? 'crosshair' : 'default',
  });

  Object.assign(debugCanvas.style, sharedStyle, {
    zIndex: '40',
    display: state.debugVisible && state.cameraReady && previewPresentation.showDebugOverlay ? 'block' : 'none',
    pointerEvents: 'none',
    border: '0',
    boxShadow: 'none',
  });

  Object.assign(calibrationLayer.style, {
    position: 'absolute',
    inset: '0',
    zIndex: '50',
    pointerEvents: 'none',
  });

  if (handPreviewPanel) {
    Object.assign(handPreviewPanel.style, {
      display: state.cameraReady ? 'block' : 'none',
      opacity: state.cameraReady ? '1' : '0',
    });
  }

  if (handPreviewVideo) {
    Object.assign(handPreviewVideo.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    });
  }

  if (handPreviewOverlay) {
    Object.assign(handPreviewOverlay.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    });
  }

  if (ui.layoutSurface) {
    Object.assign(ui.layoutSurface.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '43',
      pointerEvents: state.layoutMode ? 'auto' : 'none',
      cursor: state.layoutMode ? 'crosshair' : 'default',
    });
  }
};

const syncProjectionGeometry = () => {
  if (state.calibrationPoints.length !== 4) {
    return;
  }

  const stageRect = uiControls.getStageRect();
  state.calibrationTransform = createProjectiveTransform({
    source: getRectCorners(stageRect),
    target: state.calibrationPoints,
  });
  state.padRois = uiControls.getPadElements().map((element) => {
    return mapDomRectToQuad(state.calibrationTransform, element.getBoundingClientRect());
  });
  state.knobRect = getQuadBounds(
    mapDomRectToQuad(state.calibrationTransform, uiControls.getKnobRect()),
  );
  state.sliderRects = Object.fromEntries(sliderKeys.map((key) => {
    return [key, getQuadBounds(mapDomRectToQuad(state.calibrationTransform, uiControls.getSliderRect(key)))];
  }));
};

const syncManualLayoutRuntime = () => {
  if (!state.manualLayout || !state.cameraReady || !cameraPreview.videoWidth || !cameraPreview.videoHeight) {
    state.runtimeManualLayout = null;
    return;
  }

  state.runtimeManualLayout = buildRuntimeLayout(state.manualLayout, {
    width: cameraPreview.videoWidth,
    height: cameraPreview.videoHeight,
  });
};

const clearOccupancyRuntime = () => {
  occupancyDetector.reset();
  strudelAdapter.stopAllVoices();
  state.occupancyStates = state.occupancyStates.map(() => ({
    status: 'empty',
    transition: null,
  }));
  uiControls.getPadElements().forEach((_, index) => {
    uiControls.setPadActive(index, false);
  });
};

const resetLayoutDraft = () => {
  state.manualLayoutDraft = buildDraftWithPreviewSize();
  state.layoutStepIndex = 0;
  state.layoutDrawingRect = null;
  state.layoutPointerStart = null;
};

const enterLayoutMode = () => {
  if (!state.cameraReady) {
    setStatus('请先启动摄像头');
    updateUiState();
    return;
  }

  state.layoutMode = true;
  resetLayoutDraft();
  clearOccupancyRuntime();
  setStatus('布局模式：请从 Pad 1 开始依次绘制');
  stylePreviewElements();
  updateUiState();
};

const exitLayoutMode = () => {
  state.layoutMode = false;
  state.layoutDrawingRect = null;
  state.layoutPointerStart = null;
  setStatus(state.manualLayout ? '已退出布局模式，沿用已保存布局' : '已退出布局模式');
  stylePreviewElements();
  updateUiState();
};

const undoLayoutStep = () => {
  if (!state.layoutMode || state.layoutStepIndex === 0) {
    return;
  }

  const previousStep = manualLayoutSteps[state.layoutStepIndex - 1];
  removeLastRectFromDraft(state.manualLayoutDraft, previousStep);
  state.layoutStepIndex -= 1;
  state.layoutDrawingRect = null;
  state.layoutPointerStart = null;
  setStatus(`已撤销，回到 ${previousStep.label}`);
  updateUiState();
};

const redrawCurrentLayoutStep = () => {
  if (!state.layoutMode) {
    return;
  }

  state.layoutDrawingRect = null;
  state.layoutPointerStart = null;
  const currentStep = getCurrentLayoutStep();
  setStatus(currentStep ? `请重新绘制 ${currentStep.label}` : '全部区域已完成，可保存布局');
  updateUiState();
};

const clearLayoutDraft = () => {
  if (!state.layoutMode) {
    return;
  }

  resetLayoutDraft();
  setStatus('已清空布局草稿，请从 Pad 1 开始重画');
  updateUiState();
};

const cyclePreviewMode = async () => {
  state.previewMode = togglePreviewMode(state.previewMode);
  const activeGeometry = getActiveGeometry();
  const shouldAutoCapture = shouldAutoCaptureBaselineOnModeChange({
    nextPreviewMode: state.previewMode,
    baselineReady: state.baselineReady,
    geometryReady: activeGeometry.padRois.length === padCount,
  });

  setStatus(
    state.previewMode === previewModes.align
      ? '已切回对位模式，请继续调整摄像头与触发图'
      : shouldAutoCapture
        ? '已进入运行模式，正在自动采集空场，请保持 16 格为空'
        : '已进入运行模式，实时回显已隐藏，可直接开始识别',
  );
  stylePreviewElements();
  updateUiState();
  renderDebug();

  if (shouldAutoCapture) {
    try {
      await captureBaseline();
      setStatus('运行模式已就绪：空场已自动采集，现在遮挡 16 格会发声');
      updateUiState();
    } catch (error) {
      console.error(error);
      setStatus('自动采集空场失败，请点击“采集空场”重试');
      updateUiState();
    }
  }
};

const saveCurrentManualLayout = () => {
  if (!state.layoutMode) {
    return;
  }

  const validation = validateManualLayout(state.manualLayoutDraft);
  if (!validation.ok) {
    setStatus('布局未完成，无法保存');
    updateUiState();
    return;
  }

  state.manualLayout = structuredClone(state.manualLayoutDraft);
  saveManualLayout(globalThis.localStorage, state.manualLayout);
  state.layoutMode = false;
  state.baselineReady = false;
  state.layoutDrawingRect = null;
  state.layoutPointerStart = null;
  syncManualLayoutRuntime();
  clearOccupancyRuntime();
  setStatus('手工布局已保存，请保持 16 格为空后点击采集空场');
  stylePreviewElements();
  updateUiState();
};

const resetCalibration = () => {
  state.calibrationPoints = [];
  state.calibrationTransform = null;
  state.padRois = [];
  state.knobRect = null;
  state.sliderRects = {};
  state.baselineReady = false;
  clearOccupancyRuntime();
  setStatus(state.manualLayout ? '已清空四点标定，当前仍优先使用手工布局' : '请在预览中重新点击四个角点');
  updateUiState();
};

const captureBaseline = async () => {
  const activeGeometry = getActiveGeometry();

  if (!state.cameraReady || activeGeometry.padRois.length !== padCount) {
    return;
  }

  state.baselineReady = false;
  clearOccupancyRuntime();
  setStatus('正在采集空场 baseline');
  const frames = [];

  for (let index = 0; index < 12; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    frames.push(samplePadFeatures(cameraPreview, activeGeometry.padRois, null));
  }

  occupancyDetector.setBaseline(averageFeatures(frames));
  state.baselineReady = true;
  setStatus('运行中');
  updateUiState();
};

const getVideoPointFromEvent = (event) => {
  const rect = cameraPreview.getBoundingClientRect();
  const clientX = event.clientX ?? event.touches?.[0]?.clientX ?? 0;
  const clientY = event.clientY ?? event.touches?.[0]?.clientY ?? 0;

  return {
    x: ((clientX - rect.left) / rect.width) * cameraPreview.videoWidth,
    y: ((clientY - rect.top) / rect.height) * cameraPreview.videoHeight,
  };
};

const getPreviewRelativePoint = (event) => {
  const rect = calibrationLayer.getBoundingClientRect();
  const clientX = event.clientX ?? event.touches?.[0]?.clientX ?? 0;
  const clientY = event.clientY ?? event.touches?.[0]?.clientY ?? 0;

  return {
    x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
    y: Math.max(0, Math.min(rect.height, clientY - rect.top)),
  };
};

const createRectFromPoints = (start, end) => {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const right = Math.max(start.x, end.x);
  const bottom = Math.max(start.y, end.y);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
};

const handleLayoutPointerDown = (event) => {
  if (!state.layoutMode || event.button !== 0) {
    return;
  }

  event.preventDefault();
  state.layoutPointerStart = getPreviewRelativePoint(event);
  state.layoutDrawingRect = null;
  ui.layoutSurface?.setPointerCapture?.(event.pointerId);
  updateUiState();
};

const handleLayoutPointerMove = (event) => {
  if (!state.layoutMode || !state.layoutPointerStart) {
    return;
  }

  state.layoutDrawingRect = createRectFromPoints(
    state.layoutPointerStart,
    getPreviewRelativePoint(event),
  );
  renderLayoutOverlay();
};

const handleLayoutPointerUp = (event) => {
  if (!state.layoutMode || !state.layoutPointerStart) {
    return;
  }

  event.preventDefault();
  const nextRect = createRectFromPoints(
    state.layoutPointerStart,
    getPreviewRelativePoint(event),
  );
  state.layoutPointerStart = null;
  state.layoutDrawingRect = null;

  if (!isValidLayoutRect(nextRect)) {
    setStatus('区域太小，请重画当前项');
    updateUiState();
    return;
  }

  const currentStep = getCurrentLayoutStep();
  if (!currentStep) {
    updateUiState();
    return;
  }

  applyRectToDraft(state.manualLayoutDraft, currentStep, nextRect);
  state.layoutStepIndex += 1;
  const nextStep = getCurrentLayoutStep();
  setStatus(nextStep ? `已保存 ${currentStep.label}，请继续绘制 ${nextStep.label}` : '全部区域已完成，可保存布局');
  updateUiState();
};

const handleLayoutPointerCancel = () => {
  if (!state.layoutMode) {
    return;
  }

  state.layoutPointerStart = null;
  state.layoutDrawingRect = null;
  updateUiState();
};

const handleCalibrationClick = (event) => {
  if (
    !state.cameraReady
    || state.useViewportGuide
    || state.layoutMode
    || state.manualLayout
    || state.calibrationPoints.length >= 4
  ) {
    return;
  }

  state.calibrationPoints = [...state.calibrationPoints, getVideoPointFromEvent(event)];
  if (state.calibrationPoints.length === 4) {
    syncProjectionGeometry();
    setStatus('标定完成，请保持 16 格为空并点击采集空场');
  } else {
    setStatus(`已记录 ${state.calibrationPoints.length} 个点`);
  }

  updateUiState();
};

const applyHandControl = (point) => {
  const activeGeometry = getActiveGeometry();

  if (!point || state.layoutMode || !activeGeometry.vibeRect) {
    return;
  }

  const sliders = {};
  let knobAngle = null;

  if (isPointInRect(point, expandRect(activeGeometry.vibeRect, 26))) {
    knobAngle = mapPointToKnobAngle(point, activeGeometry.vibeRect);
  }

  sliderKeys.forEach((key) => {
    const rect = activeGeometry.sliderRects[key];
    if (isPointInRect(point, expandRect(rect, 20, 18))) {
      sliders[key] = mapPointToSliderValue(point, rect);
    }
  });

  if (Number.isFinite(knobAngle) || Object.keys(sliders).length > 0) {
    router.applyHandInput({
      knobAngle,
      sliders,
    });
  }
};

const renderDebug = (handPoint = null) => {
  const activeGeometry = getActiveGeometry();

  if (!state.cameraReady || !cameraPreview.videoWidth) {
    return;
  }

  debugOverlay.resize(cameraPreview.videoWidth, cameraPreview.videoHeight);
  debugOverlay.render({
    rois: activeGeometry.padRois,
    occupied: state.occupancyStates.map((item) => item.status === 'occupied'),
    calibrationPoints: state.calibrationPoints,
    handPoint,
    controlRects: activeGeometry.controlRects,
    baselineReady: state.baselineReady,
    statusText: state.status,
  });
};

const resizeHandPreviewCanvas = () => {
  if (!handPreviewOverlay) {
    return { width: 0, height: 0 };
  }

  const width = Math.max(1, Math.round(handPreviewOverlay.clientWidth));
  const height = Math.max(1, Math.round(handPreviewOverlay.clientHeight));

  if (handPreviewOverlay.width !== width || handPreviewOverlay.height !== height) {
    handPreviewOverlay.width = width;
    handPreviewOverlay.height = height;
  }

  return { width, height };
};

const clearHandPreview = () => {
  if (!handPreviewContext || !handPreviewPanel) {
    return;
  }

  const { width, height } = resizeHandPreviewCanvas();
  handPreviewContext.clearRect(0, 0, width, height);
  handPreviewPanel.style.borderColor = 'rgba(247, 215, 195, 0.29)';
  handPreviewPanel.style.boxShadow = '0 18px 48px rgba(0, 0, 0, 0.34)';
};

const drawHandConnection = (context, landmarks, fromIndex, toIndex, color, width, height) => {
  const from = landmarks[fromIndex];
  const to = landmarks[toIndex];
  if (!from || !to) {
    return;
  }

  context.beginPath();
  context.moveTo(from.x * width, from.y * height);
  context.lineTo(to.x * width, to.y * height);
  context.strokeStyle = color.stroke;
  context.lineWidth = 2.2;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.stroke();
};

const drawHandPoints = (context, landmarks, color, width, height) => {
  landmarks.forEach((landmark) => {
    context.beginPath();
    context.arc(landmark.x * width, landmark.y * height, 3.2, 0, Math.PI * 2);
    context.fillStyle = color.fill;
    context.fill();
  });
};

const toPreviewHands = (handState) => {
  if (handState?.hands?.length) {
    return handState.hands
      .map((hand) => ({
        handedness: hand.handedness,
        landmarks: hand.normalizedPoints ?? [],
      }))
      .filter((hand) => hand.landmarks.length);
  }

  const fallbackLandmarks = handState?.normalizedPoints ?? [];
  if (!fallbackLandmarks.length) {
    return [];
  }

  return [{
    handedness: handState.handedness ?? 'Unknown',
    landmarks: fallbackLandmarks,
  }];
};

const renderHandPreview = (handState) => {
  if (!handPreviewContext) {
    return;
  }

  const { width, height } = resizeHandPreviewCanvas();
  handPreviewContext.clearRect(0, 0, width, height);

  const previewHands = toPreviewHands(handState);
  if (!previewHands.length) {
    clearHandPreview();
    return;
  }

  previewHands.forEach(({ handedness, landmarks }) => {
    const color = handColors[handedness] ?? handColors.Unknown;
    handConnections.forEach(([fromIndex, toIndex]) => {
      drawHandConnection(handPreviewContext, landmarks, fromIndex, toIndex, color, width, height);
    });
    drawHandPoints(handPreviewContext, landmarks, color, width, height);
  });

  if (handPreviewPanel) {
    handPreviewPanel.style.borderColor = 'rgba(255, 246, 230, 0.62)';
    handPreviewPanel.style.boxShadow = '0 22px 56px rgba(0, 0, 0, 0.38), 0 0 28px rgba(255, 240, 220, 0.18)';
  }
};

const wirePadFallback = () => {
  uiControls.getPadElements().forEach((pad, index) => {
    const patternKey = getGridCellPatternKey(index);
    const label = patternKey ?? 'empty';
    pad.title = label;
    pad.setAttribute('aria-label', `Pad ${index + 1} ${label}`);

    const stop = () => {
      strudelAdapter.stopPadVoice(index);
      if (!state.baselineReady) {
        uiControls.setPadActive(index, false);
      }
    };

    pad.addEventListener('pointerdown', async (event) => {
      event.preventDefault();
      await strudelRuntime.ensureReady().catch(() => undefined);
      strudelAdapter.startPadVoice(index);
      if (!state.baselineReady) {
        uiControls.setPadActive(index, true);
      }
    });
    pad.addEventListener('pointerup', stop);
    pad.addEventListener('pointerleave', stop);
    pad.addEventListener('pointercancel', stop);
  });
};

const wireSliderFallback = () => {
  sliderKeys.forEach((key) => {
    const track = document.querySelector(`.slider-track[data-param="${key}"]`);
    if (!track) {
      return;
    }

    const applyFromPointer = (event) => {
      const rect = uiControls.getSliderRect(key);
      const value = mapPointToSliderValue({
        x: event.clientX,
        y: event.clientY,
      }, rect);
      uiControls.setSliderValue(key, value);
      strudelAdapter.setSliderValue(key, value);
    };

    track.addEventListener('pointerdown', async (event) => {
      event.preventDefault();
      await strudelRuntime.ensureReady().catch(() => undefined);
      applyFromPointer(event);

      const move = (moveEvent) => applyFromPointer(moveEvent);
      const stop = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop, { once: true });
    });
  });
};

const wireKnobFallback = () => {
  const knob = document.querySelector('#knob');
  if (!knob) {
    return;
  }

  const applyFromPointer = (event) => {
    const angle = mapPointToKnobAngle({
      x: event.clientX,
      y: event.clientY,
    }, uiControls.getKnobRect());
    uiControls.setKnobAngle(angle);
    strudelAdapter.setKnobAngle(angle);
  };

  knob.addEventListener('pointerdown', async (event) => {
    event.preventDefault();
    await strudelRuntime.ensureReady().catch(() => undefined);
    applyFromPointer(event);

    const move = (moveEvent) => applyFromPointer(moveEvent);
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  });
};

const startCamera = async () => {
  if (state.cameraReady) {
    return;
  }

  if (location.protocol === 'file:') {
    setStatus('请用 localhost 或 https 打开页面');
    updateUiState();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('当前浏览器不支持摄像头');
    updateUiState();
    return;
  }

  setStatus('正在启动摄像头');
  const stream = await cameraController.start();
  if (handPreviewVideo) {
    handPreviewVideo.srcObject = stream;
    await handPreviewVideo.play().catch(() => undefined);
  }
  await handController.start();
  state.cameraReady = true;
  state.handReady = true;
  syncManualLayoutRuntime();
  setStatus(
    state.useViewportGuide
      ? '自动触发图已启动，请调整摄像头让覆盖框和下方合成器对齐'
      : state.manualLayout
        ? '已加载手工布局，请采集空场'
        : '请在预览中依次点击 左上 / 右上 / 右下 / 左下',
  );
  updateUiState();
  stylePreviewElements();
  renderDebug();
};

const loop = (now) => {
  if (state.cameraReady && state.handReady && cameraPreview.readyState >= 2) {
    const activeGeometry = getActiveGeometry();
    uiControls.setWaveform(buildWaveform(now));
    const handState = handController.detect({
      video: cameraPreview,
      now,
    });
    const handPoint = getControlPoint(handState);
    const handBounds = handState.active ? createHandBounds(handState.points, 28) : null;

    if (!state.layoutMode && state.baselineReady && activeGeometry.padRois.length === padCount) {
      const features = samplePadFeatures(cameraPreview, activeGeometry.padRois, handBounds);

      state.occupancyStates = occupancyDetector.update(features);
      router.applyOccupancyStates(state.occupancyStates);
      state.occupancyStates.forEach((padState, index) => {
        uiControls.setPadActive(index, padState.status === 'occupied');
      });
    }

    applyHandControl(handPoint);
    renderDebug(handPoint);
    renderHandPreview(handState);
  } else {
    clearHandPreview();
  }

  requestAnimationFrame(loop);
};

const createControlButton = (label, action) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.action = action;
  Object.assign(button.style, {
    border: '1px solid rgba(255, 164, 132, 0.28)',
    borderRadius: '6px',
    background: 'rgba(18, 12, 14, 0.86)',
    color: '#f7d9c3',
    padding: '5px 9px',
    fontSize: '11px',
    lineHeight: '1',
    cursor: 'pointer',
  });
  return button;
};

const createCalibrationMarker = ({ index, label, anchorX, anchorY }) => {
  const marker = document.createElement('div');
  marker.dataset.markerIndex = String(index);
  marker.textContent = label;
  Object.assign(marker.style, {
    position: 'absolute',
    width: '22px',
    height: '22px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '999px',
    border: '1px solid rgba(255, 244, 177, 0.88)',
    fontSize: '11px',
    fontWeight: '700',
    lineHeight: '1',
    pointerEvents: 'none',
    zIndex: '45',
  });

  marker.style[anchorX] = '10px';
  marker.style[anchorY] = '10px';

  return { index, element: marker };
};

const mountCalibrationUi = () => {
  calibrationLayer.style.pointerEvents = 'none';

  ui.layoutSurface = document.createElement('div');
  Object.assign(ui.layoutSurface.style, {
    position: 'absolute',
    inset: '0',
    zIndex: '43',
    pointerEvents: 'none',
  });

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'absolute',
    inset: '0',
    zIndex: '44',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '10px',
    borderRadius: '10px',
    background: 'linear-gradient(180deg, rgba(6, 4, 5, 0.16), rgba(6, 4, 5, 0.06) 45%, rgba(6, 4, 5, 0.22))',
    pointerEvents: 'none',
  });

  ui.statusText = document.createElement('div');
  ui.statusText.textContent = state.status;
  Object.assign(ui.statusText.style, {
    alignSelf: 'flex-start',
    maxWidth: '72%',
    padding: '4px 8px',
    borderRadius: '999px',
    border: '1px solid rgba(255, 164, 132, 0.22)',
    background: 'rgba(9, 7, 8, 0.66)',
    backdropFilter: 'blur(6px)',
    fontSize: '10px',
    color: '#f7d9c3',
    lineHeight: '1.2',
  });

  ui.hintText = document.createElement('div');
  Object.assign(ui.hintText.style, {
    marginTop: '6px',
    maxWidth: '72%',
    padding: '5px 8px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 164, 132, 0.14)',
    background: 'rgba(9, 7, 8, 0.44)',
    fontSize: '10px',
    color: '#f7d9c3',
    lineHeight: '1.3',
  });

  ui.progressText = document.createElement('div');
  Object.assign(ui.progressText.style, {
    marginTop: '6px',
    alignSelf: 'flex-start',
    padding: '3px 7px',
    borderRadius: '999px',
    background: 'rgba(38, 23, 8, 0.72)',
    color: '#fff0b5',
    fontSize: '10px',
    lineHeight: '1',
  });

  const statusColumn = document.createElement('div');
  Object.assign(statusColumn.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    pointerEvents: 'none',
  });
  statusColumn.append(ui.statusText, ui.hintText, ui.progressText);

  ui.pointRow = document.createElement('div');
  Object.assign(ui.pointRow.style, {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
    maxWidth: '58%',
  });
  calibrationOrder.forEach((label, index) => {
    const chip = document.createElement('div');
    chip.dataset.pointIndex = String(index);
    chip.textContent = label;
    Object.assign(chip.style, {
      border: '1px solid rgba(255, 164, 132, 0.22)',
      borderRadius: '999px',
      padding: '3px 7px',
      fontSize: '10px',
      lineHeight: '1',
      color: '#ffd7c1',
      background: 'rgba(15, 10, 12, 0.58)',
      backdropFilter: 'blur(4px)',
      opacity: '0.42',
    });
    ui.pointRow.append(chip);
  });

  const topRow = document.createElement('div');
  Object.assign(topRow.style, {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '8px',
    pointerEvents: 'none',
  });
  topRow.append(statusColumn, ui.pointRow);

  const buttonRow = document.createElement('div');
  Object.assign(buttonRow.style, {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    alignSelf: 'flex-start',
    padding: '6px',
    borderRadius: '10px',
    background: 'rgba(10, 8, 9, 0.68)',
    backdropFilter: 'blur(8px)',
    pointerEvents: 'auto',
  });

  ui.cameraButton = createControlButton('开镜头', 'camera');
  ui.previewModeButton = createControlButton('进入运行', 'preview-mode');
  ui.baselineButton = createControlButton('采集空场', 'baseline');
  ui.resetButton = createControlButton('重标定', 'reset');
  ui.debugButton = createControlButton('调试', 'debug');
  ui.layoutButton = createControlButton('布局模式', 'layout');
  ui.undoLayoutButton = createControlButton('撤销', 'layout-undo');
  ui.redrawLayoutButton = createControlButton('重画当前', 'layout-redraw');
  ui.clearLayoutButton = createControlButton('清空', 'layout-clear');
  ui.saveLayoutButton = createControlButton('保存布局', 'layout-save');
  ui.exitLayoutButton = createControlButton('退出布局', 'layout-exit');

  buttonRow.append(
    ui.cameraButton,
    ui.previewModeButton,
    ui.baselineButton,
    ui.resetButton,
    ui.debugButton,
    ui.layoutButton,
    ui.undoLayoutButton,
    ui.redrawLayoutButton,
    ui.clearLayoutButton,
    ui.saveLayoutButton,
    ui.exitLayoutButton,
  );
  ui.cornerMarkers = calibrationMarkerLayout.map((layout) => {
    const marker = createCalibrationMarker(layout);
    panel.append(marker.element);
    return marker;
  });
  calibrationLayer.append(ui.layoutSurface);
  panel.append(topRow, buttonRow);
  calibrationLayer.append(panel);

  ui.cameraButton.addEventListener('click', () => {
    startCamera().catch((error) => {
      console.error(error);
      setStatus('摄像头启动失败，请检查权限');
      updateUiState();
    });
  });
  ui.previewModeButton.addEventListener('click', cyclePreviewMode);
  ui.baselineButton.addEventListener('click', () => {
    captureBaseline().catch((error) => {
      console.error(error);
      setStatus('采集空场失败');
      updateUiState();
    });
  });
  ui.resetButton.addEventListener('click', resetCalibration);
  ui.debugButton.addEventListener('click', () => {
    state.debugVisible = !state.debugVisible;
    stylePreviewElements();
    updateUiState();
  });
  ui.layoutButton.addEventListener('click', enterLayoutMode);
  ui.undoLayoutButton.addEventListener('click', undoLayoutStep);
  ui.redrawLayoutButton.addEventListener('click', redrawCurrentLayoutStep);
  ui.clearLayoutButton.addEventListener('click', clearLayoutDraft);
  ui.saveLayoutButton.addEventListener('click', saveCurrentManualLayout);
  ui.exitLayoutButton.addEventListener('click', exitLayoutMode);
  ui.layoutSurface.addEventListener('pointerdown', handleLayoutPointerDown);
  ui.layoutSurface.addEventListener('pointermove', handleLayoutPointerMove);
  ui.layoutSurface.addEventListener('pointerup', handleLayoutPointerUp);
  ui.layoutSurface.addEventListener('pointercancel', handleLayoutPointerCancel);
};

const bootstrap = async () => {
  mountCalibrationUi();
  uiControls.setKnobAngle(defaultControlState.knobAngle);
  sliderKeys.forEach((key) => {
    uiControls.setSliderValue(key, defaultControlState[key]);
    strudelAdapter.setSliderValue(key, defaultControlState[key]);
  });
  strudelAdapter.setKnobAngle(defaultControlState.knobAngle);
  updateUiState();
  stylePreviewElements();
  wirePadFallback();
  wireSliderFallback();
  wireKnobFallback();

  window.addEventListener('resize', () => {
    stylePreviewElements();
    syncProjectionGeometry();
    renderLayoutOverlay();
    renderDebug();
  });
  window.addEventListener('pointerdown', () => {
    strudelRuntime.ensureReady().catch(() => undefined);
  });
  cameraPreview.addEventListener('click', handleCalibrationClick);

  if (!state.loopStarted) {
    state.loopStarted = true;
    requestAnimationFrame(loop);
  }

  try {
    await startCamera();
  } catch (error) {
    console.error(error);
    setStatus('请点击“启用摄像头”继续');
    updateUiState();
  }
};

window.synthRuntime = {
  padCount,
  uiControls,
  cameraController,
  handController,
  debugOverlay,
  strudelRuntime,
  router,
  captureBaseline,
  resetCalibration,
  enterLayoutMode,
  exitLayoutMode,
  saveCurrentManualLayout,
};

bootstrap().catch((error) => {
  console.error(error);
  setStatus('初始化失败');
  updateUiState();
});
