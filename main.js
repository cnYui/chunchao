const scene = document.querySelector("#scene");
const instrumentElements = Array.from(document.querySelectorAll(".instrument"));

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
};

let sceneRect = scene.getBoundingClientRect();

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

const measureScene = () => {
  sceneRect = scene.getBoundingClientRect();
};

const updatePointer = (event) => {
  pointerSource.active = true;
  pointerSource.x = clamp((event.clientX - sceneRect.left) / sceneRect.width, 0, 1);
  pointerSource.y = clamp((event.clientY - sceneRect.top) / sceneRect.height, 0, 1);
  pointerSource.timestamp = performance.now();
};

const getActiveInteractionSource = (currentTime) => {
  if (handSource.active && currentTime - handSource.timestamp <= handTrackingConfig.staleMs) {
    return handSource;
  }

  if (pointerSource.active) {
    return pointerSource;
  }

  return null;
};

const normalizeWithinRange = (value, min, max) => {
  const span = Math.max(max - min, 0.0001);
  return clamp((value - min) / span, 0, 1);
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

const mapPalmToScene = (palmCenter) => {
  const mappedX = normalizeWithinRange(
    palmCenter.x,
    handTrackingConfig.mapping.left,
    handTrackingConfig.mapping.right,
  );
  const mappedY = normalizeWithinRange(
    palmCenter.y,
    handTrackingConfig.mapping.top,
    handTrackingConfig.mapping.bottom,
  );

  return {
    x: handTrackingConfig.mapping.mirrorX ? 1 - mappedX : mappedX,
    y: mappedY,
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
  const candidates = (results.landmarks ?? [])
    .map((landmarks, index) => {
      const handedness = handednessGroups[index]?.[0]?.categoryName ?? "Unknown";
      const confidence = handednessGroups[index]?.[0]?.score ?? 0;
      const palmCenter = getPalmCenter(landmarks);
      const mappedPoint = mapPalmToScene(palmCenter);

      return {
        x: mappedPoint.x,
        y: mappedPoint.y,
        confidence,
        handedness,
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

  handSource.active = true;
  handSource.x = trackingState.smoothedX;
  handSource.y = trackingState.smoothedY;
  handSource.confidence = primaryHand.confidence;
  handSource.handedness = primaryHand.handedness;
  handSource.strength = 0.92 + primaryHand.confidence * 0.28;
  handSource.timestamp = currentTime;
};

const createTrackingVideo = () => {
  const video = document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("aria-hidden", "true");
  video.style.position = "fixed";
  video.style.top = "0";
  video.style.left = "-9999px";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  document.body.append(video);
  return video;
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
  trackingState.video?.remove();
  trackingState.handLandmarker = null;
  trackingState.stream = null;
  trackingState.video = null;
  trackingState.started = false;
  trackingState.lastVideoTime = -1;
  trackingState.lastPredictAt = 0;
  trackingState.preferredHandedness = "Unknown";
  handSource.active = false;
  handSource.confidence = 0;
  handSource.handedness = "Unknown";
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
      trackingState.lastVideoTime = trackingState.video.currentTime;
      trackingState.lastPredictAt = currentTime;
    } catch (error) {
      console.warn("手部追踪帧处理失败，当前保留鼠标交互作为后备。", error);
      cleanupTrackingResources();
    }
  }

  requestAnimationFrame(trackHands);
};

scene.addEventListener("pointerenter", (event) => {
  measureScene();
  updatePointer(event);
});

scene.addEventListener("pointermove", (event) => {
  updatePointer(event);
});

scene.addEventListener("pointerleave", () => {
  pointerSource.active = false;
});

window.addEventListener("resize", measureScene);
window.addEventListener("pointerdown", () => {
  ensureHandTracking();
}, { passive: true });

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

  requestAnimationFrame(animate);
};

measureScene();
ensureHandTracking();
requestAnimationFrame(trackHands);
requestAnimationFrame(animate);
