const videoPart1Url = new URL(
  './video/1a21117e4e7916df5b51a3864ea114a9_raw.mp4',
  import.meta.url,
).href;
const videoPart2Url = new URL(
  './video/4577a95e9284af02d27603fb8d11bc3e_raw.mp4',
  import.meta.url,
).href;
const videoPart3Url = new URL(
  './video/e1e4aa1ee14b1794a6d6d781f966be1a_raw.mp4',
  import.meta.url,
).href;

export const videoSegments = Object.freeze([
  {
    src: videoPart1Url,
    sourceFile: './video/1a21117e4e7916df5b51a3864ea114a9_raw.mp4',
    interactionIndex: 0,
    id: 'video-part-1',
  },
  {
    src: videoPart2Url,
    sourceFile: './video/4577a95e9284af02d27603fb8d11bc3e_raw.mp4',
    interactionIndex: 1,
    id: 'video-part-2',
  },
  {
    src: videoPart3Url,
    sourceFile: './video/e1e4aa1ee14b1794a6d6d781f966be1a_raw.mp4',
    interactionIndex: null,
    id: 'video-part-3',
  },
]);

export const interactionTimeline = Object.freeze([
  {
    sceneIndex: 1,
    id: 'bg2-score',
  },
  {
    sceneIndex: 0,
    id: 'bg1-music',
  },
]);

export const getTimelineSegment = (segmentIndex) => {
  return videoSegments[segmentIndex] ?? null;
};

export const getInteractionStep = (interactionIndex) => {
  return interactionTimeline[interactionIndex] ?? null;
};

export const isLastTimelineSegment = (segmentIndex) => {
  return segmentIndex >= videoSegments.length - 1;
};
