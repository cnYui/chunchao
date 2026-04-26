const scene = document.querySelector("#scene");
const sceneStage = document.querySelector("#scene-stage");
const scenes = Array.from(document.querySelectorAll(".scene"));
const instrumentElements = Array.from(document.querySelectorAll(".instrument"));
const frontMode = document.body.dataset.frontMode ?? "interactive";
const isInteractiveMode = frontMode === "interactive";
const isVideoTimelineMode = frontMode === "video-timeline";
const shouldInitializeInteractionLayer = isInteractiveMode || isVideoTimelineMode;
const videoStage = document.querySelector("#video-stage");
const referenceVideo = document.querySelector("#reference-video");
const videoActions = document.querySelector("#video-actions");
const videoSkipButton = document.querySelector("#video-skip");
const videoVolumeControl = document.querySelector("#video-volume-control");
const videoVolumeToggle = document.querySelector("#video-volume-toggle");
const videoVolumeRange = document.querySelector("#video-volume-range");
const finalStage = document.querySelector("#final-stage");
const finalFrame = document.querySelector("#final-frame");
const interactionActions = document.querySelector("#interaction-actions");
const interactionContinueButton = document.querySelector("#interaction-continue");
const pageNav = document.querySelector(".page-nav");
const pagePrevButton = document.querySelector("#page-prev");
const pageNextButton = document.querySelector("#page-next");
const pageCurrent = document.querySelector("#page-current");
const pageTotal = document.querySelector("#page-total");
const musicTuner = document.querySelector("#music-tuner");
const musicTunerToggle = document.querySelector("#music-tuner-toggle");
const musicTunerPanel = document.querySelector("#music-tuner-panel");
const scoreTuner = document.querySelector("#score-tuner");
const scoreTunerToggle = document.querySelector("#score-tuner-toggle");
const scoreTunerPanel = document.querySelector("#score-tuner-panel");
const musicArtboard = document.querySelector("#music-artboard");
const scoreSheet = document.querySelector("#score-sheet");
const scoreArtboard = document.querySelector("#score-artboard");
const scoreSheetImage = document.querySelector("#score-sheet-image");
const scoreParticleCanvas = document.querySelector("#score-particle-canvas");
const scoreParticleContext = scoreParticleCanvas.getContext("2d");
const trackingPreview = document.querySelector("#tracking-preview");
const trackingPreviewVideo = document.querySelector("#tracking-preview-video");
const trackingPreviewOverlay = document.querySelector("#tracking-preview-overlay");
const trackingPreviewContext = trackingPreviewOverlay.getContext("2d");

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothStep = (current, target, alpha) => current + (target - current) * alpha;
const getStepPrecision = (step) => {
  const stepText = String(step ?? 1);
  const decimalPart = stepText.split(".")[1];
  return decimalPart ? decimalPart.length : 0;
};
const formatControlValue = (value, step = 1) => {
  const precision = getStepPrecision(step);
  return precision > 0 ? value.toFixed(precision) : String(Math.round(value));
};
const normalizeControlValue = (value, control) => {
  const step = Number(control.step ?? 1);
  const min = Number(control.min ?? Number.NEGATIVE_INFINITY);
  const max = Number(control.max ?? Number.POSITIVE_INFINITY);
  const precision = getStepPrecision(step);
  const clamped = clamp(value, min, max);
  const stepped = step > 0 ? Math.round(clamped / step) * step : clamped;

  return precision > 0 ? Number(stepped.toFixed(precision)) : Math.round(stepped);
};
const pickControlValues = (source, controls) => {
  return Object.fromEntries(
    controls.map((control) => [control.key, normalizeControlValue(source[control.key], control)]),
  );
};

const pointerSource = {
  active: false,
  x: 0.5,
  y: 0.5,
  strength: 1,
  confidence: 1,
  handedness: "Unknown",
  timestamp: 0,
};

const handSource = {
  active: false,
  x: 0.5,
  y: 0.5,
  strength: 1,
  confidence: 0,
  handedness: "Unknown",
  timestamp: 0,
};

const defaultPhysics = {
  radiusBase: 0.4,
  sizeScale: 2,
  impulse: 0.25,
  spring: 0.04,
  damping: 0.95,
  xLimit: 0.32,
  yLimit: 0.36,
};
const physics = { ...defaultPhysics };

const defaultScoreParticleConfig = {
  sampleStep: 1,
  alphaThreshold: 22,
  darknessThreshold: 0.39,
  minParticleSize: 0.75,
  particleSizeBase: 0.22,
  particleSizeDarknessScale: 0.42,
  interactionRadius: 20,
  repelStrength: 5,
  swirlStrength: 3.2,
  spring: 0.105,
  damping: 0.82,
  maxSpeed: 26,
  maxCanvasScale: 2,
  touchLandmarkIndices: [0, 4, 8, 12, 16, 20],
};
const scoreParticleConfig = { ...defaultScoreParticleConfig };

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
    stroke: "rgba(255, 182, 120, 0.9)",
    fill: "rgba(255, 236, 213, 0.96)",
  },
  Right: {
    stroke: "rgba(118, 220, 255, 0.92)",
    fill: "rgba(221, 247, 255, 0.98)",
  },
  Unknown: {
    stroke: "rgba(255, 246, 230, 0.88)",
    fill: "rgba(255, 255, 255, 0.98)",
  },
};

const handTrackingConfig = {
  staleMs: 180,
  smoothing: 0.34,
  minConfidence: 0.45,
  predictionIntervalMs: 1000 / 30,
  cameraWidth: 1280,
  cameraHeight: 720,
  palmIndices: [0, 5, 9, 13, 17],
  mapping: {
    left: 0,
    right: 1,
    top: 0,
    bottom: 1,
    mirrorX: false,
  },
};

const mediapipeConfig = {
  // 当前项目没有构建链路，先用官方 CDN 保持接入成本最低。
  bundleUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs",
  wasmRoot: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
  modelAssetPath:
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
};

const trackingState = {
  starting: false,
  started: false,
  permanentlyUnavailable: false,
  handLandmarker: null,
  stream: null,
  video: null,
  lastVideoTime: -1,
  lastPredictAt: 0,
  preferredHandedness: "Unknown",
  smoothedX: 0.5,
  smoothedY: 0.5,
  scoreTouchPoints: [],
};

const defaultScoreState = {
  x: 47.8,
  y: 32.2,
  width: 83,
  height: 140.1,
  scale: 0.53,
  stretchX: 1.06,
  stretchY: 0.81,
};

const scoreState = { ...defaultScoreState };
const createScoreParticleSprite = () => {
  const spriteSize = 48;
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = spriteSize;
  spriteCanvas.height = spriteSize;

  const spriteContext = spriteCanvas.getContext("2d");
  if (!spriteContext) {
    return spriteCanvas;
  }

  const center = spriteSize / 2;
  const gradient = spriteContext.createRadialGradient(
    center,
    center,
    spriteSize * 0.08,
    center,
    center,
    center,
  );

  gradient.addColorStop(0, "rgba(5, 5, 5, 1)");
  gradient.addColorStop(0.58, "rgba(5, 5, 5, 0.96)");
  gradient.addColorStop(1, "rgba(5, 5, 5, 0)");

  spriteContext.fillStyle = gradient;
  spriteContext.fillRect(0, 0, spriteSize, spriteSize);

  return spriteCanvas;
};
const scoreParticleState = {
  particles: [],
  ready: false,
  layoutWidth: 0,
  layoutHeight: 0,
  pixelRatio: 1,
  sourceCanvas: document.createElement("canvas"),
  sourceContext: null,
  spriteCanvas: createScoreParticleSprite(),
};
const videoSegments = [
  {
    src: "./video/1a21117e4e7916df5b51a3864ea114a9_raw.mp4?v=20260425-newclips2",
    interactionIndex: 0,
    id: "video-part-1",
  },
  {
    src: "./video/4577a95e9284af02d27603fb8d11bc3e_raw.mp4?v=20260425-newclips3",
    interactionIndex: 1,
    id: "video-part-2",
  },
  {
    src: "./video/e1e4aa1ee14b1794a6d6d781f966be1a_raw.mp4?v=20260425-newclips4",
    interactionIndex: null,
    id: "video-part-3",
  },
];
const interactionTimeline = [
  {
    sceneIndex: 1,
    id: "bg2-score",
  },
  {
    sceneIndex: 0,
    id: "bg1-music",
  },
];
const timelineState = {
  activeInteractionIndex: null,
  currentSegmentIndex: 0,
};

const videoVolumeState = {
  volume: 0.7,
  muted: true,
};

let currentPageIndex = 0;
let sceneRect = sceneStage.getBoundingClientRect();

const instruments = instrumentElements.map((element) => {
  const x = Number(element.dataset.x);
  const y = Number(element.dataset.y);
  const size = Number(element.dataset.size);
  const influence = Number(element.dataset.influence ?? 1);
  const force = Number(element.dataset.force ?? 1);

  element.style.setProperty("--x", `${x}%`);
  element.style.setProperty("--y", `${y}%`);
  element.style.setProperty("--size", `${size}%`);

  return {
    element,
    anchorX: x / 100,
    anchorY: y / 100,
    size: size / 100,
    influence,
    force,
    offsetX: 0,
    offsetY: 0,
    velocityX: 0,
    velocityY: 0,
  };
});

const musicTuningControls = [
  { key: "radiusBase", label: "基础触发半径", min: 0.1, max: 1.2, step: 0.01 },
  { key: "sizeScale", label: "尺寸半径增益", min: 0.4, max: 4, step: 0.05 },
  { key: "impulse", label: "排斥力度", min: 0.05, max: 0.8, step: 0.01 },
  { key: "spring", label: "回弹力度", min: 0.01, max: 0.2, step: 0.005 },
  { key: "damping", label: "阻尼", min: 0.6, max: 0.99, step: 0.01 },
  { key: "xLimit", label: "横向位移上限", min: 0.05, max: 0.8, step: 0.01 },
  { key: "yLimit", label: "纵向位移上限", min: 0.05, max: 0.8, step: 0.01 },
];

const scoreLayoutTuningControls = [
  { key: "x", label: "中心 X", min: -50, max: 150, step: 0.1 },
  { key: "y", label: "中心 Y", min: -50, max: 150, step: 0.1 },
  { key: "width", label: "基础宽度", min: 10, max: 240, step: 0.1 },
  { key: "height", label: "基础高度", min: 10, max: 260, step: 0.1 },
  { key: "scale", label: "整体缩放", min: 0.05, max: 3, step: 0.01 },
  { key: "stretchY", label: "只上下拉伸", min: 0.2, max: 3, step: 0.01 },
  { key: "stretchX", label: "只左右拉伸", min: 0.2, max: 3, step: 0.01 },
];

const scoreParticleTuningControls = [
  { key: "sampleStep", label: "采样步长", min: 1, max: 6, step: 1 },
  { key: "alphaThreshold", label: "透明阈值", min: 0, max: 80, step: 1 },
  { key: "darknessThreshold", label: "暗部阈值", min: 0, max: 0.4, step: 0.01 },
  { key: "minParticleSize", label: "最小粒子尺寸", min: 0.2, max: 4, step: 0.05 },
  { key: "particleSizeBase", label: "粒子基础倍率", min: 0.05, max: 1.2, step: 0.01 },
  { key: "particleSizeDarknessScale", label: "暗部尺寸增益", min: 0.05, max: 1.5, step: 0.01 },
  { key: "interactionRadius", label: "交互半径", min: 20, max: 220, step: 1 },
  { key: "repelStrength", label: "排斥强度", min: 0, max: 40, step: 0.5 },
  { key: "swirlStrength", label: "旋涡强度", min: 0, max: 10, step: 0.1 },
  { key: "spring", label: "回弹力度", min: 0.01, max: 0.3, step: 0.005 },
  { key: "damping", label: "阻尼", min: 0.5, max: 0.99, step: 0.01 },
  { key: "maxSpeed", label: "最大速度", min: 1, max: 60, step: 1 },
];

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.setAttribute("readonly", "");
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.append(fallback);
    fallback.select();

    try {
      const success = document.execCommand("copy");
      fallback.remove();
      return success;
    } catch (fallbackError) {
      console.warn("复制调参配置失败。", fallbackError);
      fallback.remove();
      return false;
    }
  }
};

const setupTuningPanel = ({
  root,
  toggle,
  panel,
  title,
  description,
  sections,
  controls,
  source,
  defaults,
  onChange,
  getPayload,
}) => {
  if (!root || !toggle || !panel) {
    return;
  }

  const inputs = new Map();
  let statusTimer = 0;
  const normalizedSections = sections ?? [
    {
      key: "default",
      title: "",
      description: "",
      controls,
      source,
      defaults,
      onChange,
    },
  ];
  const getInputKey = (sectionKey, controlKey) => `${sectionKey}:${controlKey}`;

  const titleElement = document.createElement("h3");
  titleElement.className = "scene-tuner__title";
  titleElement.textContent = title;

  const descriptionElement = document.createElement("p");
  descriptionElement.className = "scene-tuner__description";
  descriptionElement.textContent = description;

  const grid = document.createElement("div");
  grid.className = "scene-tuner__grid";
  const output = document.createElement("textarea");
  output.className = "scene-tuner__output";
  output.readOnly = true;

  const setStatus = (message) => {
    status.textContent = message;

    if (statusTimer) {
      window.clearTimeout(statusTimer);
    }

    if (message) {
      statusTimer = window.setTimeout(() => {
        status.textContent = "";
      }, 2600);
    }
  };

  const syncInputs = () => {
    normalizedSections.forEach((section) => {
      section.controls.forEach((control) => {
        const input = inputs.get(getInputKey(section.key, control.key));
        if (!input) {
          return;
        }

        input.value = formatControlValue(section.source[control.key], control.step);
      });
    });
  };
  const syncOutput = () => {
    output.value = JSON.stringify(getPayload(), null, 2);
  };

  normalizedSections.forEach((section) => {
    const sectionElement = document.createElement("section");
    sectionElement.className = "scene-tuner__section";

    if (section.title) {
      const sectionTitle = document.createElement("h4");
      sectionTitle.className = "scene-tuner__section-title";
      sectionTitle.textContent = section.title;
      sectionElement.append(sectionTitle);
    }

    if (section.description) {
      const sectionDescription = document.createElement("p");
      sectionDescription.className = "scene-tuner__section-description";
      sectionDescription.textContent = section.description;
      sectionElement.append(sectionDescription);
    }

    const sectionGrid = document.createElement("div");
    sectionGrid.className = "scene-tuner__grid";

    section.controls.forEach((control) => {
      const field = document.createElement("label");
      field.className = "scene-tuner__field";

      const labelRow = document.createElement("span");
      labelRow.className = "scene-tuner__field-label";

      const labelText = document.createElement("span");
      labelText.textContent = control.label;

      const labelNote = document.createElement("span");
      labelNote.className = "scene-tuner__field-note";
      labelNote.textContent = `${control.min} - ${control.max}`;

      const input = document.createElement("input");
      input.type = "number";
      input.min = String(control.min);
      input.max = String(control.max);
      input.step = String(control.step);
      input.value = formatControlValue(section.source[control.key], control.step);

      const updateValue = (commit = false) => {
        if (input.value === "") {
          return;
        }

        const nextValue = Number.parseFloat(input.value);
        if (!Number.isFinite(nextValue)) {
          return;
        }

        const normalized = normalizeControlValue(nextValue, control);
        section.source[control.key] = normalized;
        section.onChange?.(control.key, normalized);
        syncOutput();

        if (commit) {
          input.value = formatControlValue(normalized, control.step);
        }
      };

      input.addEventListener("input", () => {
        updateValue(false);
      });
      input.addEventListener("change", () => {
        updateValue(true);
      });
      input.addEventListener("blur", () => {
        input.value = formatControlValue(section.source[control.key], control.step);
      });

      labelRow.append(labelText, labelNote);
      field.append(labelRow, input);
      sectionGrid.append(field);
      inputs.set(getInputKey(section.key, control.key), input);
    });

    sectionElement.append(sectionGrid);
    grid.append(sectionElement);
  });

  const actions = document.createElement("div");
  actions.className = "scene-tuner__actions";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "scene-tuner__action";
  copyButton.textContent = "复制参数";
  copyButton.addEventListener("click", async () => {
    syncOutput();
    const copied = await copyText(output.value);
    setStatus(copied ? "已复制当前参数，直接发给我就行。" : "复制失败了，下面的 JSON 可以直接手动复制。");
  });

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "scene-tuner__action";
  resetButton.textContent = "重置";
  resetButton.addEventListener("click", () => {
    normalizedSections.forEach((section) => {
      section.controls.forEach((control) => {
        section.source[control.key] = section.defaults[control.key];
      });
      section.onChange?.();
    });
    syncInputs();
    syncOutput();
    setStatus("已恢复默认参数。");
  });

  actions.append(copyButton, resetButton);

  const hint = document.createElement("p");
  hint.className = "scene-tuner__hint";
  hint.textContent = "改完点“复制参数”，把 JSON 发给我，我再按它回写成正式版本。";

  const status = document.createElement("p");
  status.className = "scene-tuner__status";
  status.setAttribute("aria-live", "polite");

  syncOutput();
  panel.append(titleElement, descriptionElement, grid, actions, hint, output, status);

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    panel.hidden = !open;
    if (open) {
      syncInputs();
      syncOutput();
    }
  };

  setOpen(false);

  toggle.addEventListener("click", () => {
    setOpen(panel.hidden);
  });

  ["click", "pointerdown", "pointermove", "keydown"].forEach((eventName) => {
    root.addEventListener(eventName, (event) => {
      event.stopPropagation();
      if (eventName !== "keydown") {
        pointerSource.active = false;
      }
    });
  });
};

const syncVideoSkipUi = () => {
  if (!videoActions) {
    return;
  }

  const currentSegment = getCurrentVideoSegment();
  const canSkipToInteraction = currentSegment?.interactionIndex !== null &&
    currentSegment?.interactionIndex !== undefined;
  const canSkipToFinal = isLastVideoSegment();
  const shouldShow =
    isVideoTimelineMode &&
    timelineState.activeInteractionIndex === null &&
    !document.body.classList.contains("is-final-active") &&
    (canSkipToInteraction || canSkipToFinal);

  videoActions.classList.toggle("is-hidden", !shouldShow);
  videoActions.setAttribute("aria-hidden", shouldShow ? "false" : "true");
};

const getInteractionStep = (interactionIndex) => {
  return interactionTimeline[interactionIndex] ?? null;
};

const getCurrentVideoSegment = () => {
  return videoSegments[timelineState.currentSegmentIndex] ?? null;
};

const isLastVideoSegment = () => timelineState.currentSegmentIndex >= videoSegments.length - 1;

const setFinalStageVisible = (visible) => {
  document.body.classList.toggle("is-final-active", visible);

  if (finalStage) {
    finalStage.classList.toggle("is-hidden", !visible);
    finalStage.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  if (videoStage) {
    videoStage.classList.toggle("is-hidden", visible);
    videoStage.setAttribute("aria-hidden", visible ? "true" : "false");
  }

  if (visible) {
    referenceVideo?.pause();
    sceneStage?.classList.add("is-hidden");
    sceneStage?.setAttribute("aria-hidden", "true");
    interactionActions?.classList.add("is-hidden");
    interactionActions?.setAttribute("aria-hidden", "true");
    trackingPreview?.classList.add("is-hidden");
    trackingPreview?.setAttribute("aria-hidden", "true");

    if (finalFrame && !finalFrame.getAttribute("src")) {
      finalFrame.setAttribute("src", finalFrame.dataset.src ?? "./synthesizer.html");
    }
  }
};

const syncVideoVolumeUi = () => {
  if (!referenceVideo) {
    return;
  }

  referenceVideo.volume = videoVolumeState.volume;
  referenceVideo.muted = videoVolumeState.muted || videoVolumeState.volume <= 0;

  if (videoVolumeRange) {
    videoVolumeRange.value = String(videoVolumeState.volume);
  }

  if (videoVolumeToggle) {
    const muted = referenceVideo.muted;
    videoVolumeToggle.textContent = muted ? "开声" : "声音";
    videoVolumeToggle.setAttribute("aria-pressed", muted ? "false" : "true");
  }
};

const setVideoSegment = (segmentIndex) => {
  if (!referenceVideo || !videoSegments.length) {
    return;
  }

  const safeIndex = clamp(segmentIndex, 0, videoSegments.length - 1);
  const nextSegment = videoSegments[safeIndex];
  if (!nextSegment) {
    return;
  }

  timelineState.currentSegmentIndex = safeIndex;

  if (referenceVideo.getAttribute("src") !== nextSegment.src) {
    referenceVideo.setAttribute("src", nextSegment.src);
    referenceVideo.load();
  }

  syncVideoVolumeUi();
};

const playReferenceVideo = async () => {
  if (!referenceVideo) {
    return;
  }

  syncVideoVolumeUi();
  await referenceVideo.play().catch(async () => {
    videoVolumeState.muted = true;
    syncVideoVolumeUi();
    await referenceVideo.play().catch(() => undefined);
  });
};

const setInteractionUiVisible = (visible) => {
  document.body.classList.toggle("is-interaction-active", visible);

  if (sceneStage) {
    sceneStage.classList.toggle("is-hidden", !visible);
    sceneStage.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  if (interactionActions) {
    interactionActions.classList.toggle("is-hidden", !visible);
    interactionActions.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  if (trackingPreview) {
    trackingPreview.classList.toggle("is-hidden", !visible);
    trackingPreview.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  syncVideoSkipUi();
};

const openTimelineInteraction = (interactionIndex) => {
  if (!isVideoTimelineMode) {
    return;
  }

  const step = getInteractionStep(interactionIndex);
  if (!step || timelineState.activeInteractionIndex !== null) {
    return;
  }

  timelineState.activeInteractionIndex = interactionIndex;
  referenceVideo?.pause();
  setPage(step.sceneIndex);
  setInteractionUiVisible(true);
  ensureHandTracking();

  requestAnimationFrame(() => {
    measureScene();
    rebuildScoreParticles();
  });
};

const openInteractionForCurrentSegment = () => {
  if (!isVideoTimelineMode || timelineState.activeInteractionIndex !== null) {
    return;
  }

  const currentSegment = getCurrentVideoSegment();
  if (currentSegment?.interactionIndex === null || currentSegment?.interactionIndex === undefined) {
    syncVideoSkipUi();
    return;
  }

  openTimelineInteraction(currentSegment.interactionIndex);
};

const continueTimelinePlayback = async () => {
  if (!isVideoTimelineMode || timelineState.activeInteractionIndex === null) {
    return;
  }

  const nextSegmentIndex = timelineState.currentSegmentIndex + 1;
  timelineState.activeInteractionIndex = null;
  pointerSource.active = false;
  setInteractionUiVisible(false);
  setVideoSegment(nextSegmentIndex);

  await playReferenceVideo();
  syncVideoSkipUi();
};

const skipToNextInteraction = () => {
  if (!isVideoTimelineMode || timelineState.activeInteractionIndex !== null) {
    return;
  }

  if (isLastVideoSegment()) {
    setFinalStageVisible(true);
    return;
  }

  openInteractionForCurrentSegment();
};

const setupVideoPlayer = () => {
  if (!referenceVideo) {
    return;
  }

  setFinalStageVisible(false);
  setInteractionUiVisible(false);
  referenceVideo.defaultMuted = true;
  syncVideoVolumeUi();
  setVideoSegment(0);
  syncVideoSkipUi();

  referenceVideo.addEventListener("loadedmetadata", () => {
    playReferenceVideo();
  });

  referenceVideo.addEventListener("canplay", () => {
    playReferenceVideo();
  });

  referenceVideo.addEventListener("ended", () => {
    if (isLastVideoSegment()) {
      setFinalStageVisible(true);
      return;
    }

    openInteractionForCurrentSegment();
  });

  videoSkipButton?.addEventListener("click", () => {
    skipToNextInteraction();
  });

  interactionContinueButton?.addEventListener("click", () => {
    continueTimelinePlayback();
  });

  videoVolumeToggle?.addEventListener("click", () => {
    videoVolumeState.muted = !videoVolumeState.muted;
    if (!videoVolumeState.muted && videoVolumeState.volume <= 0) {
      videoVolumeState.volume = 0.7;
    }

    syncVideoVolumeUi();
    playReferenceVideo();
  });

  videoVolumeRange?.addEventListener("input", () => {
    const nextVolume = clamp(Number.parseFloat(videoVolumeRange.value), 0, 1);
    videoVolumeState.volume = Number.isFinite(nextVolume) ? nextVolume : 0;
    videoVolumeState.muted = videoVolumeState.volume <= 0;
    syncVideoVolumeUi();
  });

  playReferenceVideo();
};

const measureScene = () => {
  if (currentPageIndex === 0 && musicArtboard) {
    sceneRect = musicArtboard.getBoundingClientRect();
    return;
  }

  sceneRect = sceneStage.getBoundingClientRect();
};

scoreParticleState.sourceContext = scoreParticleState.sourceCanvas.getContext("2d", {
  willReadFrequently: true,
});

const updatePointer = (event) => {
  if (
    currentPageIndex === 0 &&
    (
      event.clientX < sceneRect.left ||
      event.clientX > sceneRect.right ||
      event.clientY < sceneRect.top ||
      event.clientY > sceneRect.bottom
    )
  ) {
    pointerSource.active = false;
    return;
  }

  pointerSource.active = true;
  pointerSource.x = clamp((event.clientX - sceneRect.left) / sceneRect.width, 0, 1);
  pointerSource.y = clamp((event.clientY - sceneRect.top) / sceneRect.height, 0, 1);
  pointerSource.timestamp = performance.now();
};

const getActiveInteractionSource = (currentTime) => {
  if (currentPageIndex !== 0) {
    return null;
  }

  if (handSource.active && currentTime - handSource.timestamp <= handTrackingConfig.staleMs) {
    return handSource;
  }

  if (pointerSource.active) {
    return pointerSource;
  }

  return null;
};

const applyScoreState = () => {
  // 谱面页改成全屏背景后，摆位参数直接按整屏百分比生效，避免再套旧画板映射。
  const visibleWidth = scoreState.width * scoreState.scale * scoreState.stretchX;
  const visibleHeight = scoreState.height * scoreState.scale * scoreState.stretchY;

  scoreSheet.style.setProperty("--score-x", `${scoreState.x}%`);
  scoreSheet.style.setProperty("--score-y", `${scoreState.y}%`);
  scoreSheet.style.setProperty("--score-width", `${visibleWidth}%`);
  scoreSheet.style.setProperty("--score-height", `${visibleHeight}%`);
};

const resizeScoreParticleCanvas = () => {
  if (!scoreArtboard) {
    return { width: 0, height: 0 };
  }

  const width = Math.round(scoreSheet.clientWidth);
  const height = Math.round(scoreSheet.clientHeight);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, scoreParticleConfig.maxCanvasScale);

  if (width <= 0 || height <= 0) {
    scoreParticleState.layoutWidth = 0;
    scoreParticleState.layoutHeight = 0;
    scoreParticleState.pixelRatio = 1;
    return { width: 0, height: 0 };
  }

  const bufferWidth = Math.max(1, Math.round(width * pixelRatio));
  const bufferHeight = Math.max(1, Math.round(height * pixelRatio));

  if (scoreParticleCanvas.width !== bufferWidth) {
    scoreParticleCanvas.width = bufferWidth;
  }

  if (scoreParticleCanvas.height !== bufferHeight) {
    scoreParticleCanvas.height = bufferHeight;
  }

  scoreParticleContext.setTransform(1, 0, 0, 1, 0, 0);
  scoreParticleContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  scoreParticleContext.imageSmoothingEnabled = true;

  scoreParticleState.layoutWidth = width;
  scoreParticleState.layoutHeight = height;
  scoreParticleState.pixelRatio = pixelRatio;

  return { width, height };
};

const rebuildScoreParticles = () => {
  if (
    !scoreParticleContext ||
    !scoreParticleState.sourceContext ||
    !scoreSheetImage.complete ||
    !scoreSheetImage.naturalWidth
  ) {
    return;
  }

  const { width, height } = resizeScoreParticleCanvas();
  if (!width || !height) {
    return;
  }

  scoreParticleState.sourceCanvas.width = width;
  scoreParticleState.sourceCanvas.height = height;
  scoreParticleState.sourceContext.imageSmoothingEnabled = true;
  scoreParticleState.sourceContext.clearRect(0, 0, width, height);
  scoreParticleState.sourceContext.drawImage(scoreSheetImage, 0, 0, width, height);

  const imageData = scoreParticleState.sourceContext.getImageData(0, 0, width, height).data;
  const particles = [];
  const step = scoreParticleConfig.sampleStep;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      let strongestAlpha = 0;
      let strongestDarkness = 0;

      for (let by = 0; by < step && y + by < height; by += 1) {
        for (let bx = 0; bx < step && x + bx < width; bx += 1) {
          const index = ((y + by) * width + (x + bx)) * 4;
          const r = imageData[index];
          const g = imageData[index + 1];
          const b = imageData[index + 2];
          const alpha = imageData[index + 3];
          const darkness = 1 - (r + g + b) / (255 * 3);

          if (alpha > strongestAlpha) {
            strongestAlpha = alpha;
          }

          if (darkness > strongestDarkness) {
            strongestDarkness = darkness;
          }
        }
      }

      if (
        strongestAlpha >= scoreParticleConfig.alphaThreshold &&
        strongestDarkness >= scoreParticleConfig.darknessThreshold
      ) {
        const particleX = Math.min(width, x + step * 0.5);
        const particleY = Math.min(height, y + step * 0.5);
        const alpha = 0.16 + (strongestAlpha / 255) * 0.84;
        const size = Math.max(
          scoreParticleConfig.minParticleSize,
          step *
            (
              scoreParticleConfig.particleSizeBase +
              strongestDarkness * scoreParticleConfig.particleSizeDarknessScale
            ),
        );

        particles.push({
          x: particleX,
          y: particleY,
          homeX: particleX,
          homeY: particleY,
          velocityX: 0,
          velocityY: 0,
          alpha,
          size,
        });
      }
    }
  }

  scoreParticleState.particles = particles;
  scoreParticleState.ready = particles.length > 0;
  scoreSheet.classList.toggle("is-particle-ready", scoreParticleState.ready);
};

const mapPointToScene = (point) => {
  const mappedX = normalizeWithinRange(
    point.x,
    handTrackingConfig.mapping.left,
    handTrackingConfig.mapping.right,
  );
  const mappedY = normalizeWithinRange(
    point.y,
    handTrackingConfig.mapping.top,
    handTrackingConfig.mapping.bottom,
  );

  return {
    x: handTrackingConfig.mapping.mirrorX ? 1 - mappedX : mappedX,
    y: mappedY,
  };
};

const mapScenePointToScore = (point) => {
  if (!scoreParticleState.layoutWidth || !scoreParticleState.layoutHeight) {
    return null;
  }

  const scoreRect = scoreSheet.getBoundingClientRect();
  if (!scoreRect.width || !scoreRect.height) {
    return null;
  }

  const globalX = sceneRect.left + point.x * sceneRect.width;
  const globalY = sceneRect.top + point.y * sceneRect.height;
  const hitPadding = scoreParticleConfig.interactionRadius;

  if (
    globalX < scoreRect.left - hitPadding ||
    globalX > scoreRect.right + hitPadding ||
    globalY < scoreRect.top - hitPadding ||
    globalY > scoreRect.bottom + hitPadding
  ) {
    return null;
  }

  return {
    x: ((globalX - scoreRect.left) / scoreRect.width) * scoreParticleState.layoutWidth,
    y: ((globalY - scoreRect.top) / scoreRect.height) * scoreParticleState.layoutHeight,
  };
};

const getScoreInteractionPoints = () => {
  if (currentPageIndex !== 1 || !scoreParticleState.ready) {
    return [];
  }

  const points = trackingState.scoreTouchPoints
    .map(mapScenePointToScore)
    .filter(Boolean);

  if (!points.length && pointerSource.active) {
    const fallbackPoint = mapScenePointToScore(pointerSource);
    if (fallbackPoint) {
      points.push(fallbackPoint);
    }
  }

  return points;
};

const updateScoreParticles = (delta) => {
  if (!scoreParticleContext || !scoreParticleState.ready) {
    return;
  }

  const { width, height } = resizeScoreParticleCanvas();
  const interactionPoints = getScoreInteractionPoints();
  const radius = scoreParticleConfig.interactionRadius;
  const radiusSquared = radius * radius;
  const damping = Math.pow(scoreParticleConfig.damping, delta);

  scoreParticleContext.clearRect(0, 0, width, height);
  scoreParticleContext.fillStyle = "#050505";

  for (const particle of scoreParticleState.particles) {
    for (const touchPoint of interactionPoints) {
      const dx = particle.x - touchPoint.x;
      const dy = particle.y - touchPoint.y;
      const distanceSquared = dx * dx + dy * dy;

      if (distanceSquared < radiusSquared) {
        const distance = Math.sqrt(distanceSquared) || 0.0001;
        const intensity = 1 - distance / radius;
        const force = intensity * intensity * scoreParticleConfig.repelStrength * delta;
        const normalX = dx / distance;
        const normalY = dy / distance;

        particle.velocityX += normalX * force - normalY * force * 0.22 * scoreParticleConfig.swirlStrength;
        particle.velocityY += normalY * force + normalX * force * 0.22 * scoreParticleConfig.swirlStrength;
      }
    }

    particle.velocityX += (particle.homeX - particle.x) * scoreParticleConfig.spring * delta;
    particle.velocityY += (particle.homeY - particle.y) * scoreParticleConfig.spring * delta;
    particle.velocityX *= damping;
    particle.velocityY *= damping;

    const speed = Math.hypot(particle.velocityX, particle.velocityY);
    if (speed > scoreParticleConfig.maxSpeed) {
      const ratio = scoreParticleConfig.maxSpeed / speed;
      particle.velocityX *= ratio;
      particle.velocityY *= ratio;
    }

    particle.x += particle.velocityX * delta;
    particle.y += particle.velocityY * delta;

    scoreParticleContext.globalAlpha = particle.alpha;
    scoreParticleContext.drawImage(
      scoreParticleState.spriteCanvas,
      particle.x - particle.size,
      particle.y - particle.size,
      particle.size * 2,
      particle.size * 2,
    );
  }

  scoreParticleContext.globalAlpha = 1;
};

setupTuningPanel({
  root: musicTuner,
  toggle: musicTunerToggle,
  panel: musicTunerPanel,
  title: "乐器页调参",
  description: "这里调的是乐器排斥和回弹手感，复制后把 JSON 发给我即可。",
  controls: musicTuningControls,
  source: physics,
  defaults: defaultPhysics,
  getPayload: () => ({
    page: "music",
    physics: pickControlValues(physics, musicTuningControls),
  }),
});

setupTuningPanel({
  root: scoreTuner,
  toggle: scoreTunerToggle,
  panel: scoreTunerPanel,
  title: "琴谱页调参",
  description: "这里同时保留摆位、横纵向拉伸和粒子效果调参，改完直接复制 JSON 发给我。",
  sections: [
    {
      key: "layout",
      title: "摆位与拉伸",
      description: "“只上下拉伸”只改高度，“只左右拉伸”只改宽度，另一方向保持不动。",
      controls: scoreLayoutTuningControls,
      source: scoreState,
      defaults: defaultScoreState,
      onChange: () => {
        applyScoreState();
        rebuildScoreParticles();
      },
    },
    {
      key: "particle",
      title: "粒子效果",
      description: "这里调粒子密度、大小、排斥和回弹手感。",
      controls: scoreParticleTuningControls,
      source: scoreParticleConfig,
      defaults: defaultScoreParticleConfig,
      onChange: () => {
        rebuildScoreParticles();
      },
    },
  ],
  getPayload: () => ({
    scoreState: pickControlValues(scoreState, scoreLayoutTuningControls),
    scoreParticleConfig: pickControlValues(scoreParticleConfig, scoreParticleTuningControls),
  }),
});

const setPage = (nextIndex) => {
  const targetIndex = clamp(nextIndex, 0, scenes.length - 1);

  if (targetIndex === currentPageIndex) {
    return;
  }

  currentPageIndex = targetIndex;
  pointerSource.active = false;
  measureScene();
  updatePaginationUi();
};

const updatePaginationUi = () => {
  sceneStage.dataset.pageIndex = String(currentPageIndex);
  document.body.dataset.pageIndex = String(currentPageIndex);
  scenes.forEach((page, index) => {
    page.classList.toggle("is-active", index === currentPageIndex);
  });

  pageCurrent.textContent = String(currentPageIndex + 1);
  pageTotal.textContent = String(scenes.length);
  pagePrevButton.disabled = currentPageIndex === 0;
  pageNextButton.disabled = currentPageIndex === scenes.length - 1;
};

const normalizeWithinRange = (value, min, max) => {
  const span = Math.max(max - min, 0.0001);
  return clamp((value - min) / span, 0, 1);
};

const resizePreviewCanvas = () => {
  if (!trackingPreviewContext) {
    return {
      width: trackingPreviewOverlay.clientWidth,
      height: trackingPreviewOverlay.clientHeight,
    };
  }

  const rect = trackingPreviewOverlay.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (trackingPreviewOverlay.width !== width || trackingPreviewOverlay.height !== height) {
    trackingPreviewOverlay.width = width;
    trackingPreviewOverlay.height = height;
  }

  trackingPreviewContext.setTransform(1, 0, 0, 1, 0, 0);
  trackingPreviewContext.scale(dpr, dpr);

  return {
    width: rect.width,
    height: rect.height,
  };
};

const clearTrackingPreview = () => {
  if (!trackingPreviewContext) {
    trackingPreview.classList.remove("is-detected");
    return;
  }

  const { width, height } = resizePreviewCanvas();
  trackingPreviewContext.clearRect(0, 0, width, height);
  trackingPreview.classList.remove("is-detected");
};

const drawHandConnection = (ctx, landmarks, fromIndex, toIndex, color, width, height) => {
  const from = landmarks[fromIndex];
  const to = landmarks[toIndex];
  ctx.beginPath();
  ctx.moveTo(from.x * width, from.y * height);
  ctx.lineTo(to.x * width, to.y * height);
  ctx.strokeStyle = color.stroke;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
};

const drawHandPoints = (ctx, landmarks, color, width, height) => {
  for (const landmark of landmarks) {
    ctx.beginPath();
    ctx.arc(landmark.x * width, landmark.y * height, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = color.fill;
    ctx.fill();
  }
};

const renderTrackingPreview = (results) => {
  if (!trackingPreviewContext) {
    return;
  }

  const { width, height } = resizePreviewCanvas();
  trackingPreviewContext.clearRect(0, 0, width, height);

  const landmarksList = results?.landmarks ?? [];
  const handednessGroups = results?.handednesses ?? results?.handedness ?? [];

  if (!landmarksList.length) {
    trackingPreview.classList.remove("is-detected");
    return;
  }

  trackingPreview.classList.add("is-detected");

  landmarksList.forEach((landmarks, index) => {
    const handedness = handednessGroups[index]?.[0]?.categoryName ?? "Unknown";
    const color = handColors[handedness] ?? handColors.Unknown;

    handConnections.forEach(([fromIndex, toIndex]) => {
      drawHandConnection(
        trackingPreviewContext,
        landmarks,
        fromIndex,
        toIndex,
        color,
        width,
        height,
      );
    });

    drawHandPoints(trackingPreviewContext, landmarks, color, width, height);
  });
};

const getPalmCenter = (landmarks) => {
  const total = handTrackingConfig.palmIndices.reduce(
    (sum, index) => {
      const landmark = landmarks[index];
      return {
        x: sum.x + landmark.x,
        y: sum.y + landmark.y,
      };
    },
    { x: 0, y: 0 },
  );

  return {
    x: total.x / handTrackingConfig.palmIndices.length,
    y: total.y / handTrackingConfig.palmIndices.length,
  };
};

const pickPrimaryHand = (candidates) => {
  const preferredCandidate = candidates.find(
    (candidate) => candidate.handedness === trackingState.preferredHandedness,
  );

  if (preferredCandidate) {
    return preferredCandidate;
  }

  return candidates.reduce((best, candidate) => (
    candidate.confidence > best.confidence ? candidate : best
  ));
};

const updateHandSource = (results, currentTime) => {
  const handednessGroups = results.handednesses ?? results.handedness ?? [];
  trackingState.scoreTouchPoints = [];

  const candidates = (results.landmarks ?? [])
    .map((landmarks, index) => {
      const handedness = handednessGroups[index]?.[0]?.categoryName ?? "Unknown";
      const confidence = handednessGroups[index]?.[0]?.score ?? 0;
      const palmCenter = getPalmCenter(landmarks);
      const mappedPoint = mapPointToScene(palmCenter);
      const touchPoints = scoreParticleConfig.touchLandmarkIndices.map((touchIndex) => (
        mapPointToScene(landmarks[touchIndex])
      ));

      return {
        x: mappedPoint.x,
        y: mappedPoint.y,
        confidence,
        handedness,
        touchPoints,
      };
    })
    .filter((candidate) => candidate.confidence >= handTrackingConfig.minConfidence);

  if (!candidates.length) {
    return;
  }

  const primaryHand = pickPrimaryHand(candidates);
  const switchedHand = primaryHand.handedness !== trackingState.preferredHandedness;

  trackingState.preferredHandedness = primaryHand.handedness;

  if (switchedHand || !handSource.active) {
    trackingState.smoothedX = primaryHand.x;
    trackingState.smoothedY = primaryHand.y;
  } else {
    trackingState.smoothedX = smoothStep(
      trackingState.smoothedX,
      primaryHand.x,
      handTrackingConfig.smoothing,
    );
    trackingState.smoothedY = smoothStep(
      trackingState.smoothedY,
      primaryHand.y,
      handTrackingConfig.smoothing,
    );
  }

  trackingState.scoreTouchPoints = candidates.flatMap((candidate) => candidate.touchPoints);
  handSource.active = true;
  handSource.x = trackingState.smoothedX;
  handSource.y = trackingState.smoothedY;
  handSource.confidence = primaryHand.confidence;
  handSource.handedness = primaryHand.handedness;
  handSource.strength = 0.92 + primaryHand.confidence * 0.28;
  handSource.timestamp = currentTime;
};

const createTrackingVideo = () => {
  return trackingPreviewVideo;
};

const waitForVideoReady = (video) => new Promise((resolve, reject) => {
  if (video.readyState >= 2) {
    resolve();
    return;
  }

  const onLoaded = () => {
    cleanup();
    resolve();
  };

  const onError = () => {
    cleanup();
    reject(new Error("摄像头视频流初始化失败"));
  };

  const cleanup = () => {
    video.removeEventListener("loadeddata", onLoaded);
    video.removeEventListener("error", onError);
  };

  video.addEventListener("loadeddata", onLoaded, { once: true });
  video.addEventListener("error", onError, { once: true });
});

const cleanupTrackingResources = () => {
  trackingState.stream?.getTracks().forEach((track) => track.stop());
  if (trackingState.video) {
    trackingState.video.srcObject = null;
    trackingState.video.removeAttribute("src");
  }
  trackingState.video?.load();
  trackingState.handLandmarker = null;
  trackingState.stream = null;
  trackingState.video = null;
  trackingState.started = false;
  trackingState.lastVideoTime = -1;
  trackingState.lastPredictAt = 0;
  trackingState.preferredHandedness = "Unknown";
  trackingState.scoreTouchPoints = [];
  handSource.active = false;
  handSource.confidence = 0;
  handSource.handedness = "Unknown";
  clearTrackingPreview();
};

const createHandLandmarker = async () => {
  const { FilesetResolver, HandLandmarker } = await import(mediapipeConfig.bundleUrl);
  const vision = await FilesetResolver.forVisionTasks(mediapipeConfig.wasmRoot);

  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: mediapipeConfig.modelAssetPath,
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.45,
    minTrackingConfidence: 0.45,
  });
};

const ensureHandTracking = async () => {
  if (trackingState.starting || trackingState.started || trackingState.permanentlyUnavailable) {
    return;
  }

  if (!window.isSecureContext) {
    trackingState.permanentlyUnavailable = true;
    console.warn("当前页面不在安全上下文中，浏览器无法启用摄像头。请改用 localhost 或 https。");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    trackingState.permanentlyUnavailable = true;
    console.warn("当前浏览器不支持摄像头访问，已退回鼠标输入。");
    return;
  }

  trackingState.starting = true;

  try {
    const video = createTrackingVideo();
    trackingState.video = video;
    const [handLandmarker, stream] = await Promise.all([
      createHandLandmarker(),
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: handTrackingConfig.cameraWidth },
          height: { ideal: handTrackingConfig.cameraHeight },
        },
      }),
    ]);

    video.srcObject = stream;
    await waitForVideoReady(video);
    await video.play().catch(() => undefined);

    trackingState.handLandmarker = handLandmarker;
    trackingState.stream = stream;
    trackingState.started = true;
  } catch (error) {
    cleanupTrackingResources();
    console.warn("手部追踪初始化失败，当前保留鼠标交互作为后备。", error);
  } finally {
    trackingState.starting = false;
  }
};

const trackHands = (currentTime) => {
  if (
    trackingState.started &&
    trackingState.handLandmarker &&
    trackingState.video?.readyState >= 2 &&
    trackingState.video.currentTime !== trackingState.lastVideoTime &&
    currentTime - trackingState.lastPredictAt >= handTrackingConfig.predictionIntervalMs
  ) {
    try {
      const results = trackingState.handLandmarker.detectForVideo(
        trackingState.video,
        currentTime,
      );

      updateHandSource(results, currentTime);
      renderTrackingPreview(results);
      trackingState.lastVideoTime = trackingState.video.currentTime;
      trackingState.lastPredictAt = currentTime;
    } catch (error) {
      console.warn("手部追踪帧处理失败，当前保留鼠标交互作为后备。", error);
      cleanupTrackingResources();
    }
  }

  requestAnimationFrame(trackHands);
};

let previousTime = performance.now();

const animate = (currentTime) => {
  const delta = Math.min((currentTime - previousTime) / 16.6667, 2.2);
  previousTime = currentTime;

  const interactionSource = getActiveInteractionSource(currentTime);
  const sceneWidth = sceneRect.width;
  const sceneHeight = sceneRect.height;
  const unit = Math.min(sceneWidth, sceneHeight);

  for (const item of instruments) {
    const anchorPxX = item.anchorX * sceneWidth;
    const anchorPxY = item.anchorY * sceneHeight;

    let targetOffsetX = 0;
    let targetOffsetY = 0;
    let isActive = false;

    if (interactionSource) {
      const sourcePxX = interactionSource.x * sceneWidth;
      const sourcePxY = interactionSource.y * sceneHeight;
      const dx = anchorPxX - sourcePxX;
      const dy = anchorPxY - sourcePxY;
      const distance = Math.hypot(dx, dy) || 0.0001;
      const radius = unit * (physics.radiusBase + item.size * physics.sizeScale) * item.influence;

      if (distance < radius) {
        const intensity = 1 - distance / radius;
        const impulse =
          unit *
          physics.impulse *
          intensity *
          intensity *
          item.force *
          interactionSource.strength;

        targetOffsetX = (dx / distance) * impulse;
        targetOffsetY = (dy / distance) * impulse;
        isActive = true;
      }
    }

    item.velocityX += (targetOffsetX - item.offsetX) * physics.spring * delta;
    item.velocityY += (targetOffsetY - item.offsetY) * physics.spring * delta;
    item.velocityX *= Math.pow(physics.damping, delta);
    item.velocityY *= Math.pow(physics.damping, delta);

    item.offsetX += item.velocityX * delta;
    item.offsetY += item.velocityY * delta;

    const xLimit = sceneWidth * physics.xLimit;
    const yLimit = sceneHeight * physics.yLimit;

    item.offsetX = clamp(item.offsetX, -xLimit, xLimit);
    item.offsetY = clamp(item.offsetY, -yLimit, yLimit);

    item.element.classList.toggle("is-active", isActive);
    item.element.style.transform =
      `translate3d(calc(-50% + ${item.offsetX}px), calc(-50% + ${item.offsetY}px), 0)`;
  }

  updateScoreParticles(delta);
  requestAnimationFrame(animate);
};

setupVideoPlayer();

if (shouldInitializeInteractionLayer) {
  sceneStage.addEventListener("pointerenter", (event) => {
    measureScene();
    updatePointer(event);
  });

  sceneStage.addEventListener("pointermove", (event) => {
    updatePointer(event);
  });

  sceneStage.addEventListener("pointerdown", (event) => {
    measureScene();
    updatePointer(event);
  });

  sceneStage.addEventListener("pointerleave", () => {
    pointerSource.active = false;
  });

  sceneStage.addEventListener("pointercancel", () => {
    pointerSource.active = false;
  });

  window.addEventListener("resize", () => {
    measureScene();
    applyScoreState();
    rebuildScoreParticles();
  });

  window.addEventListener("pointerdown", () => {
    if (isInteractiveMode || timelineState.activeInteractionIndex !== null) {
      ensureHandTracking();
    }
  }, { passive: true });

  measureScene();
  applyScoreState();
  rebuildScoreParticles();
  updatePaginationUi();
  clearTrackingPreview();

  if (isInteractiveMode) {
    videoStage?.classList.add("is-hidden");
    sceneStage.classList.remove("is-hidden");
    sceneStage.setAttribute("aria-hidden", "false");
    pageNav?.classList.remove("is-hidden");
    pageNav?.setAttribute("aria-hidden", "false");
    trackingPreview.classList.remove("is-hidden");
    trackingPreview.setAttribute("aria-hidden", "false");
    ensureHandTracking();

    window.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        setPage(currentPageIndex - 1);
      }

      if (event.key === "ArrowRight") {
        setPage(currentPageIndex + 1);
      }
    });

    pagePrevButton.addEventListener("click", () => {
      setPage(currentPageIndex - 1);
    });

    pageNextButton.addEventListener("click", () => {
      setPage(currentPageIndex + 1);
    });
  }

  if (!scoreSheetImage.complete) {
    scoreSheetImage.addEventListener("load", rebuildScoreParticles, { once: true });
  }

  requestAnimationFrame(trackHands);
  requestAnimationFrame(animate);
}
