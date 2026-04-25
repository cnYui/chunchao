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

export const createHandController = ({ createLandmarker = defaultCreateLandmarker } = {}) => {
  let handLandmarker = null;

  return {
    async start() {
      handLandmarker = await createLandmarker();
    },
    detect({ video, now }) {
      if (!handLandmarker || !video) {
        return {
          active: false,
          handedness: 'Unknown',
          points: [],
          normalizedPoints: [],
        };
      }

      const result = handLandmarker.detectForVideo(video, now);
      const rawPoints = result.landmarks?.[0] ?? [];
      const handedness = result.handednesses?.[0]?.[0]?.categoryName ?? 'Unknown';
      const scaleX = video.videoWidth || 1;
      const scaleY = video.videoHeight || 1;
      const points = rawPoints.map((point) => ({
        x: point.x * scaleX,
        y: point.y * scaleY,
      }));

      return {
        active: points.length > 0,
        handedness,
        points,
        normalizedPoints: rawPoints,
      };
    },
  };
};
