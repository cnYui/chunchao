import {
  createAudioEngine,
  createBrowserAudioSystem,
  defaultControlState,
} from './audio-engine.js';
import { createCameraController } from './camera-controller.js';
import { createDebugOverlay } from './debug-overlay.js';
import { createHandController } from './hand-controller.js';
import { createHandBounds, mapPointToKnobAngle, mapPointToSliderValue } from './hand-math.js';
import { createOccupancyDetector } from './occupancy-detector.js';
import { createProjectiveTransform, mapDomRectToQuad } from './projection-calibration.js';
import { createSynthRouter } from './synth-router.js';
import { createUiControls } from './ui-controls.js';

const frequencies = [
  261.63, 293.66, 329.63, 349.23,
  392.0, 440.0, 493.88, 523.25,
  587.33, 659.25, 698.46, 783.99,
  880.0, 987.77, 1046.5, 1174.66
];

const calibrationOrder = ['左上', '右上', '右下', '左下'];
const sliderKeys = ['volume', 'reverb', 'position'];

const uiControls = createUiControls(document);
const cameraPreview = document.querySelector('#synth-camera-preview');
const debugCanvas = document.querySelector('#synth-debug-canvas');
const calibrationLayer = document.querySelector('#synth-calibration-layer');

const browserAudio = createBrowserAudioSystem({
  initialControlState: defaultControlState,
});
const audioEngine = createAudioEngine({
  frequencies,
  createVoiceBackend: browserAudio.createVoiceBackend,
  initialControlState: defaultControlState,
  onControlStateChange: browserAudio.applyControlState,
});
const cameraController = createCameraController({
  videoElement: cameraPreview,
  width: 960,
  height: 540,
});
const handController = createHandController();
const debugOverlay = createDebugOverlay({ canvas: debugCanvas });
const occupancyDetector = createOccupancyDetector({
  padCount: frequencies.length,
  enterFrames: 10,
  exitFrames: 8,
  enterThreshold: 18,
  exitThreshold: 8,
  maxHandOverlap: 0.38,
});
const router = createSynthRouter({ audioEngine, uiControls });

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
  occupancyStates: Array.from({ length: frequencies.length }, () => ({
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

const getQuadBounds = (quad) => {
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);

  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
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
  let brightnessSum = 0;
  let brightnessSquareSum = 0;
  let edgeHits = 0;

  for (let index = 0; index < data.length; index += 4) {
    const brightness = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    brightnessSum += brightness;
    brightnessSquareSum += brightness * brightness;

    if (index >= 4) {
      const prevBrightness = data[index - 4] * 0.299 + data[index - 3] * 0.587 + data[index - 2] * 0.114;
      if (Math.abs(brightness - prevBrightness) > 18) {
        edgeHits += 1;
      }
    }
  }

  const pixelCount = Math.max(1, data.length / 4);
  const meanBrightness = brightnessSum / pixelCount;
  const variance = brightnessSquareSum / pixelCount - meanBrightness * meanBrightness;

  const overlapArea = !handBounds
    ? 0
    : Math.max(0, Math.min(handBounds.right, left + width) - Math.max(handBounds.left, left)) *
      Math.max(0, Math.min(handBounds.bottom, top + height) - Math.max(handBounds.top, top));

  return {
    brightness: Number(meanBrightness.toFixed(4)),
    variance: Number(variance.toFixed(4)),
    edgeDensity: Number((edgeHits / pixelCount).toFixed(4)),
    overlapWithHand: Number((overlapArea / (width * height)).toFixed(4)),
  };
};

const samplePadFeatures = (video, rois, handBounds) => {
  return rois.map((quad) => computeFeatureForQuad(video, quad, handBounds));
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
  const previewWidth = Math.max(220, Math.min(280, Math.round(window.innerWidth * 0.18)));
  const previewHeight = Math.round(previewWidth * 0.5625);
  const sharedStyle = {
    position: 'absolute',
    right: '16px',
    bottom: '16px',
    width: `${previewWidth}px`,
    height: `${previewHeight}px`,
    inset: 'auto',
    left: 'auto',
    top: 'auto',
    borderRadius: '10px',
  };

  Object.assign(cameraPreview.style, sharedStyle, {
    zIndex: '42',
    display: state.cameraReady ? 'block' : 'none',
    objectFit: 'fill',
    border: '1px solid rgba(255, 160, 126, 0.38)',
    background: '#050607',
    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45)',
    cursor: state.cameraReady && state.calibrationPoints.length < 4 ? 'crosshair' : 'default',
  });

  Object.assign(debugCanvas.style, sharedStyle, {
    zIndex: '43',
    display: state.debugVisible && state.cameraReady ? 'block' : 'none',
    pointerEvents: 'none',
    border: '1px solid rgba(255, 160, 126, 0.2)',
    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.25)',
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
  audioEngine.stopAllVoices();
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
  if (!state.cameraReady || state.padRois.length !== frequencies.length) {
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
    const stop = () => {
      audioEngine.stopPadVoice(index);
      if (!state.baselineReady) {
        uiControls.setPadActive(index, false);
      }
    };

    pad.addEventListener('pointerdown', async (event) => {
      event.preventDefault();
      await browserAudio.resume().catch(() => undefined);
      audioEngine.startPadVoice(index);
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
      audioEngine.setSliderValue(key, value);
    };

    track.addEventListener('pointerdown', async (event) => {
      event.preventDefault();
      await browserAudio.resume().catch(() => undefined);
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
    audioEngine.setKnobAngle(angle);
  };

  knob.addEventListener('pointerdown', async (event) => {
    event.preventDefault();
    await browserAudio.resume().catch(() => undefined);
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
    uiControls.setWaveform(browserAudio.getAnalyserByteData());
    syncProjectionGeometry();

    if (state.baselineReady && state.padRois.length === frequencies.length) {
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
    padding: '6px 10px',
    fontSize: '12px',
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
    top: '16px',
    left: '16px',
    zIndex: '44',
    width: 'min(320px, calc(100% - 32px))',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid rgba(255, 164, 132, 0.26)',
    background: 'rgba(12, 9, 11, 0.78)',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.34)',
    backdropFilter: 'blur(8px)',
    pointerEvents: 'auto',
  });

  ui.statusText = document.createElement('div');
  ui.statusText.textContent = state.status;
  Object.assign(ui.statusText.style, {
    fontSize: '13px',
    color: '#f7d9c3',
    lineHeight: '1.5',
  });

  ui.hintText = document.createElement('div');
  Object.assign(ui.hintText.style, {
    fontSize: '12px',
    color: 'rgba(247, 217, 195, 0.74)',
    lineHeight: '1.4',
  });

  ui.pointRow = document.createElement('div');
  Object.assign(ui.pointRow.style, {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  });
  calibrationOrder.forEach((label, index) => {
    const chip = document.createElement('div');
    chip.dataset.pointIndex = String(index);
    chip.textContent = label;
    Object.assign(chip.style, {
      border: '1px solid rgba(255, 164, 132, 0.22)',
      borderRadius: '999px',
      padding: '4px 8px',
      fontSize: '11px',
      color: '#ffd7c1',
      background: 'rgba(15, 10, 12, 0.72)',
      opacity: '0.42',
    });
    ui.pointRow.append(chip);
  });

  const buttonRow = document.createElement('div');
  Object.assign(buttonRow.style, {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  });

  ui.cameraButton = createControlButton('启用摄像头', 'camera');
  ui.baselineButton = createControlButton('采集空场', 'baseline');
  ui.resetButton = createControlButton('重置标定', 'reset');
  ui.debugButton = createControlButton('隐藏调试', 'debug');

  buttonRow.append(ui.cameraButton, ui.baselineButton, ui.resetButton, ui.debugButton);
  panel.append(ui.statusText, ui.hintText, ui.pointRow, buttonRow);
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
  });
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
    browserAudio.resume().catch(() => undefined);
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
  frequencies,
  uiControls,
  cameraController,
  handController,
  debugOverlay,
  audioEngine,
  router,
  captureBaseline,
  resetCalibration,
};

bootstrap().catch((error) => {
  console.error(error);
  setStatus('初始化失败');
  updateUiState();
});
