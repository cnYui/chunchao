export const createDebugOverlay = ({ canvas }) => {
  const context = canvas.getContext('2d');

  const drawRect = (rect) => {
    context.beginPath();
    context.rect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
    context.stroke();
  };

  return {
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
    },
    render({
      rois = [],
      occupied = [],
      calibrationPoints = [],
      handPoint = null,
      controlRects = [],
      interactionReady = false,
      statusText = '',
    }) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'rgba(7, 10, 12, 0.02)';
      context.fillRect(0, 0, canvas.width, canvas.height);

      calibrationPoints.forEach((point, index) => {
        context.fillStyle = '#ffd2ad';
        context.beginPath();
        context.arc(point.x, point.y, 6, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = '#1b0e09';
        context.font = '12px sans-serif';
        context.fillText(String(index + 1), point.x + 10, point.y + 4);
      });

      rois.forEach((roi, index) => {
        context.strokeStyle = occupied[index] ? '#ff5d3f' : '#5ed6d0';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(roi[0].x, roi[0].y);
        roi.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.closePath();
        context.stroke();
      });

      context.setLineDash([6, 4]);
      controlRects.forEach((rect) => {
        context.strokeStyle = '#ffd2ad';
        context.lineWidth = 1.5;
        drawRect(rect);
      });
      context.setLineDash([]);

      if (handPoint) {
        context.fillStyle = '#9af9f2';
        context.beginPath();
        context.arc(handPoint.x, handPoint.y, 7, 0, Math.PI * 2);
        context.fill();
      }

      context.fillStyle = interactionReady ? '#8efca1' : '#ffd49b';
      context.font = '12px sans-serif';
      context.fillText(interactionReady ? 'FINGER MODE READY' : 'ALIGN MODE', 12, 18);

      if (statusText) {
        context.fillStyle = '#f7d9c3';
        context.font = '12px sans-serif';
        context.fillText(statusText, 12, canvas.height - 14);
      }
    },
  };
};
