export const createCameraController = ({ videoElement, width = 960, height = 540 }) => {
  let stream = null;

  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: false,
      });

      videoElement.srcObject = stream;
      await videoElement.play().catch(() => undefined);

      return stream;
    },
    stop() {
      stream?.getTracks().forEach((track) => track.stop());
      videoElement.srcObject = null;
      stream = null;
    },
  };
};
