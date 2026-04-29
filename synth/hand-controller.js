const defaultCreateLandmarker = async ({
  numHands = 1,
} = {}) => {
  const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs');
  const fileset = await vision.FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
  );

  return vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    },
    runningMode: 'VIDEO',
    numHands,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.45,
    minTrackingConfidence: 0.45,
  });
};

const inactiveHandState = () => ({
  active: false,
  handedness: 'Unknown',
  confidence: 0,
  points: [],
  normalizedPoints: [],
  controlPoint: null,
  hands: [],
});

const getHandedness = (result, index) => {
  return result.handednesses?.[index]?.[0] ?? result.handedness?.[index]?.[0] ?? null;
};

const toScreenPoint = (point, scaleX, scaleY) => ({
  x: point.x * scaleX,
  y: point.y * scaleY,
});

const toHandCandidate = ({ landmarks, handedness, scaleX, scaleY }) => {
  const points = landmarks.map((point) => toScreenPoint(point, scaleX, scaleY));
  const confidence = handedness?.score ?? 1;
  const controlPoint = points[8] ?? null;

  return {
    active: Boolean(controlPoint),
    handedness: handedness?.categoryName ?? 'Unknown',
    confidence,
    points,
    normalizedPoints: landmarks,
    controlPoint,
  };
};

export const createHandController = ({
  createLandmarker = defaultCreateLandmarker,
  minConfidence = 0.45,
  preferredHandedness = 'Right',
  predictionIntervalMs = 1000 / 24,
} = {}) => {
  let handLandmarker = null;
  let lastVideoTime = -1;
  let lastPredictAt = 0;
  let lastState = inactiveHandState();

  return {
    async start() {
      handLandmarker = await createLandmarker({
        numHands: 1,
      });
      lastVideoTime = -1;
      lastPredictAt = 0;
      lastState = inactiveHandState();
    },
    detect({ video, now }) {
      if (!handLandmarker || !video) {
        return inactiveHandState();
      }

      const currentVideoTime = Number.isFinite(video.currentTime) ? video.currentTime : null;
      const shouldReuseLastState = (
        (currentVideoTime !== null && currentVideoTime === lastVideoTime)
        || (now - lastPredictAt < predictionIntervalMs)
      );

      if (shouldReuseLastState) {
        return lastState;
      }

      const result = handLandmarker.detectForVideo(video, now);
      const scaleX = video.videoWidth || 1;
      const scaleY = video.videoHeight || 1;
      const hands = (result.landmarks ?? [])
        .map((landmarks, index) => toHandCandidate({
          landmarks,
          handedness: getHandedness(result, index),
          scaleX,
          scaleY,
        }))
        .filter((hand) => {
          return hand.active
            && hand.confidence >= minConfidence
            && hand.handedness === preferredHandedness;
        })
        .sort((left, right) => right.confidence - left.confidence);

      const primaryHand = hands[0];
      if (!primaryHand) {
        lastPredictAt = now;
        lastVideoTime = currentVideoTime ?? lastVideoTime;
        lastState = inactiveHandState();
        return lastState;
      }

      lastPredictAt = now;
      lastVideoTime = currentVideoTime ?? lastVideoTime;
      lastState = {
        ...primaryHand,
        hands,
      };
      return lastState;
    },
  };
};
