import {
  defaultControlState,
  getVibeIndexFromAngle,
} from './audio-engine.js';
import { createBrowserStrudelRuntime } from './strudel-browser.js';
import { createCameraController } from './camera-controller.js';
import { createDebugOverlay } from './debug-overlay.js';
import { createHandController } from './hand-controller.js';
import { createHandBounds, mapPointToKnobAngle, mapPointToSliderValue } from './hand-math.js';
import { createOccupancyDetector } from './occupancy-detector.js';
import { createProjectiveTransform, mapDomRectToQuad } from './projection-calibration.js';
import { computeMaskedFeatureFromImageData, getQuadBounds } from './roi-sampling.js';
import { getGridCellPatternKey, gridPatternKeys } from './strudel-score.js';
import { createSynthRouter } from './synth-router.js';
import { createUiControls } from './ui-controls.js';

const padCount = gridPatternKeys.length;

const calibrationOrder = ['左上', '右上', '右下', '左下'];
const sliderKeys = ['volume', 'reverb', 'position'];

const uiControls = createUiControls(document);
const cameraMonitorPanel = document.querySelector('#camera-monitor-panel');
const cameraPreview = document.querySelector('#synth-camera-preview');
const debugCanvas = document.querySelector('#synth-debug-canvas');
const calibrationLayer = document.querySelector('#synth-calibration-layer');

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

const updateUiState = () => {
  if (ui.baselineButton) {
    ui.baselineButton.disabled = !state.cameraReady || state.calibrationPoints.length !== 4;
  }

  if (ui.debugButton) {
    ui.debugButton.textContent = state.debugVisible ? '隐藏调试' : '显示调试';
  }

  if (ui.hintText) {
    if (!state.cameraReady) {
      ui.hintText.textContent = '先启用摄像头';
    } else if (state.calibrationPoints.length < 4) {
      ui.hintText.textContent = `请在右下预览中依次点击 ${calibrationOrder[state.calibrationPoints.length]}`;
    } else if (!state.baselineReady) {
      ui.hintText.textContent = '标定完成，保持 16 格为空后点击采集空场';
    } else {
      ui.hintText.textContent = '运行中：方块占格发声，手指调节旋钮和滑杆';
    }
  }

  if (ui.pointRow) {
    ui.pointRow.querySelectorAll('[data-point-index]').forEach((element) => {
      const index = Number(element.dataset.pointIndex);
      const isDone = index < state.calibrationPoints.length;
      element.style.opacity = isDone ? '1' : '0.42';
      element.style.borderColor = isDone ? 'rgba(255, 164, 132, 0.88)' : 'rgba(255, 164, 132, 0.22)';
      element.style.background = isDone ? 'rgba(139, 36, 22, 0.78)' : 'rgba(15, 10, 12, 0.72)';
    });
  }
};

const stylePreviewElements = () => {
  if (!cameraMonitorPanel) {
    return;
  }

  const sharedStyle = {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    borderRadius: '10px',
  };

  Object.assign(cameraPreview.style, sharedStyle, {
    zIndex: '30',
    display: state.cameraReady ? 'block' : 'none',
    objectFit: 'fill',
    border: '0',
    background: '#050607',
    boxShadow: 'inset 0 0 0 1px rgba(255, 160, 126, 0.24)',
    cursor: state.cameraReady && state.calibrationPoints.length < 4 ? 'crosshair' : 'default',
  });

  Object.assign(debugCanvas.style, sharedStyle, {
    zIndex: '40',
    display: state.debugVisible && state.cameraReady ? 'block' : 'none',
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

const resetCalibration = () => {
  state.calibrationPoints = [];
  state.calibrationTransform = null;
  state.padRois = [];
  state.knobRect = null;
  state.sliderRects = {};
  state.baselineReady = false;
  occupancyDetector.reset();
  strudelAdapter.stopAllVoices();
  state.occupancyStates = state.occupancyStates.map(() => ({
    status: 'empty',
    transition: null,
  }));
  uiControls.getPadElements().forEach((_, index) => {
    uiControls.setPadActive(index, false);
  });
  setStatus('请在预览中重新点击四个角点');
  updateUiState();
};

const captureBaseline = async () => {
  if (!state.cameraReady || state.padRois.length !== padCount) {
    return;
  }

  setStatus('正在采集空场 baseline');
  const frames = [];

  for (let index = 0; index < 12; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    frames.push(samplePadFeatures(cameraPreview, state.padRois, null));
  }

  occupancyDetector.reset();
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

const handleCalibrationClick = (event) => {
  if (!state.cameraReady || state.calibrationPoints.length >= 4) {
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
  if (!point || !state.baselineReady) {
    return;
  }

  const sliders = {};
  let knobAngle = null;

  if (isPointInRect(point, expandRect(state.knobRect, 26))) {
    knobAngle = mapPointToKnobAngle(point, state.knobRect);
  }

  sliderKeys.forEach((key) => {
    const rect = state.sliderRects[key];
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
  if (!state.cameraReady || !cameraPreview.videoWidth) {
    return;
  }

  debugOverlay.resize(cameraPreview.videoWidth, cameraPreview.videoHeight);
  debugOverlay.render({
    rois: state.padRois,
    occupied: state.occupancyStates.map((item) => item.status === 'occupied'),
    calibrationPoints: state.calibrationPoints,
    handPoint,
    controlRects: [
      state.knobRect,
      ...sliderKeys.map((key) => state.sliderRects[key]),
    ].filter(Boolean),
    baselineReady: state.baselineReady,
    statusText: state.status,
  });
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
  await cameraController.start();
  await handController.start();
  state.cameraReady = true;
  state.handReady = true;
  setStatus('请在预览中依次点击 左上 / 右上 / 右下 / 左下');
  updateUiState();
  stylePreviewElements();
  renderDebug();
};

const loop = (now) => {
  if (state.cameraReady && state.handReady && cameraPreview.readyState >= 2) {
    uiControls.setWaveform(buildWaveform(now));

    if (state.baselineReady && state.padRois.length === padCount) {
      const handState = handController.detect({
        video: cameraPreview,
        now,
      });
      const handPoint = getControlPoint(handState);
      const handBounds = handState.active ? createHandBounds(handState.points, 28) : null;
      const features = samplePadFeatures(cameraPreview, state.padRois, handBounds);

      state.occupancyStates = occupancyDetector.update(features);
      router.applyOccupancyStates(state.occupancyStates);
      state.occupancyStates.forEach((padState, index) => {
        uiControls.setPadActive(index, padState.status === 'occupied');
      });
      applyHandControl(handPoint);
      renderDebug(handPoint);
    } else {
      renderDebug();
    }
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

const mountCalibrationUi = () => {
  calibrationLayer.style.pointerEvents = 'none';

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
    pointerEvents: 'auto',
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
  });
  topRow.append(ui.statusText, ui.pointRow);

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
  });

  ui.cameraButton = createControlButton('开镜头', 'camera');
  ui.baselineButton = createControlButton('空场', 'baseline');
  ui.resetButton = createControlButton('重标定', 'reset');
  ui.debugButton = createControlButton('调试', 'debug');

  buttonRow.append(ui.cameraButton, ui.baselineButton, ui.resetButton, ui.debugButton);
  panel.append(topRow, buttonRow);
  calibrationLayer.append(panel);

  ui.cameraButton.addEventListener('click', () => {
    startCamera().catch((error) => {
      console.error(error);
      setStatus('摄像头启动失败，请检查权限');
      updateUiState();
    });
  });
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
};

bootstrap().catch((error) => {
  console.error(error);
  setStatus('初始化失败');
  updateUiState();
});
