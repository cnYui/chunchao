const defaultCreateLandmarker = async () => {
  const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs');
  const fileset = await vision.FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
  );

  return vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    },
    runningMode: 'VIDEO',
    numHands: 2,
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

  return {
    active: points.length > 0,
    handedness: handedness?.categoryName ?? 'Unknown',
    confidence,
    points,
    normalizedPoints: landmarks,
    controlPoint: points[8] ?? points[4] ?? points[0] ?? null,
  };
};

export const createHandController = ({
  createLandmarker = defaultCreateLandmarker,
  minConfidence = 0.45,
} = {}) => {
  let handLandmarker = null;

  return {
    async start() {
      handLandmarker = await createLandmarker();
    },
    detect({ video, now }) {
      if (!handLandmarker || !video) {
        return inactiveHandState();
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
        .filter((hand) => hand.active && hand.confidence >= minConfidence)
        .sort((left, right) => right.confidence - left.confidence);

      const primaryHand = hands[0];
      if (!primaryHand) {
        return inactiveHandState();
      }

      return {
        ...primaryHand,
        hands,
      };
    },
  };
};
