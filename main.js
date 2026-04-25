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
const interactionActions = document.querySelector("#interaction-actions");
const interactionContinueButton = document.querySelector("#interaction-continue");
const pageNav = document.querySelector(".page-nav");
const pagePrevButton = document.querySelector("#page-prev");
const pageNextButton = document.querySelector("#page-next");
const pageCurrent = document.querySelector("#page-current");
const pageTotal = document.querySelector("#page-total");
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

const physics = {
  radiusBase: 0.4,
  sizeScale: 2,
  impulse: 0.25,
  spring: 0.04,
  damping: 0.95,
  xLimit: 0.32,
  yLimit: 0.36,
};

const scoreParticleConfig = {
  sampleStep: 2,
  alphaThreshold: 22,
  darknessThreshold: 0.08,
  interactionRadius: 88,
  repelStrength: 14,
  swirlStrength: 3.2,
  spring: 0.085,
  damping: 0.88,
  maxSpeed: 26,
  maxCanvasScale: 2,
  touchLandmarkIndices: [0, 4, 8, 12, 16, 20],
};

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
  x: 46.6,
  y: 18.7,
  width: 83,
  height: 140.1,
  scale: 0.3,
};

const scoreState = { ...defaultScoreState };
const scoreLayoutConfig = {
  artboardWidth: 1682,
  artboardHeight: 2528,
  legacyStageWidth: 1774,
  legacyStageHeight: 887,
};
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
    src: "./video/33bf26e484a3a504099f10ecbd2e8c13_part1.mp4?v=20260425-opt3",
    interactionIndex: 0,
    id: "video-part-1",
  },
  {
    src: "./video/33bf26e484a3a504099f10ecbd2e8c13_part2.mp4?v=20260425-opt3",
    interactionIndex: 1,
    id: "video-part-2",
  },
  {
    src: "./video/33bf26e484a3a504099f10ecbd2e8c13_part3.mp4?v=20260425-opt3",
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

const legacyScoreArtboardWidthRatio =
  (scoreLayoutConfig.legacyStageHeight *
    (scoreLayoutConfig.artboardWidth / scoreLayoutConfig.artboardHeight)) /
  scoreLayoutConfig.legacyStageWidth;
const legacyScoreArtboardLeftRatio = (1 - legacyScoreArtboardWidthRatio) * 0.5;

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

const syncVideoSkipUi = () => {
  if (!videoActions) {
    return;
  }

  const hasPendingInteraction =
    isVideoTimelineMode &&
    timelineState.activeInteractionIndex === null &&
    getCurrentVideoSegment()?.interactionIndex !== null;

  videoActions.classList.toggle("is-hidden", !hasPendingInteraction);
  videoActions.setAttribute("aria-hidden", hasPendingInteraction ? "false" : "true");
};

const getInteractionStep = (interactionIndex) => {
  return interactionTimeline[interactionIndex] ?? null;
};

const getCurrentVideoSegment = () => {
  return videoSegments[timelineState.currentSegmentIndex] ?? null;
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
};

const playReferenceVideo = async () => {
  if (!referenceVideo) {
    return;
  }

  // 浏览器默认拦截带声音的自动播放，这里先固定静音，确保刷新后能直接进入时间轴。
  referenceVideo.defaultMuted = true;
  referenceVideo.muted = true;
  await referenceVideo.play().catch(() => undefined);
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

  openInteractionForCurrentSegment();
};

const setupVideoPlayer = () => {
  if (!referenceVideo) {
    return;
  }

  setInteractionUiVisible(false);
  referenceVideo.defaultMuted = true;
  referenceVideo.muted = true;
  setVideoSegment(0);
  syncVideoSkipUi();

  referenceVideo.addEventListener("loadedmetadata", () => {
    playReferenceVideo();
  });

  referenceVideo.addEventListener("canplay", () => {
    playReferenceVideo();
  });

  referenceVideo.addEventListener("ended", () => {
    openInteractionForCurrentSegment();
  });

  videoSkipButton?.addEventListener("click", () => {
    skipToNextInteraction();
  });

  interactionContinueButton?.addEventListener("click", () => {
    continueTimelinePlayback();
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
  const visibleWidthRatio = (scoreState.width / 100) * scoreState.scale;
  const visibleHeightRatio = (scoreState.height / 100) * scoreState.scale;
  const mappedX =
    ((scoreState.x / 100 - legacyScoreArtboardLeftRatio) / legacyScoreArtboardWidthRatio) * 100;
  const mappedWidth = (visibleWidthRatio / legacyScoreArtboardWidthRatio) * 100;

  scoreSheet.style.setProperty("--score-x", `${mappedX}%`);
  scoreSheet.style.setProperty("--score-y", `${scoreState.y}%`);
  scoreSheet.style.setProperty("--score-width", `${mappedWidth}%`);
  scoreSheet.style.setProperty("--score-height", `${visibleHeightRatio * 100}%`);
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
        const size = Math.max(0.85, step * (0.22 + strongestDarkness * 0.42));

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
