export const getQuadBounds = (quad) => {
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);

  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
};

const isPointOnSegment = (point, start, end) => {
  const cross =
    (point.y - start.y) * (end.x - start.x) -
    (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > 1e-6) {
    return false;
  }

  const dot =
    (point.x - start.x) * (end.x - start.x) +
    (point.y - start.y) * (end.y - start.y);
  if (dot < 0) {
    return false;
  }

  const squaredLength =
    (end.x - start.x) * (end.x - start.x) +
    (end.y - start.y) * (end.y - start.y);

  return dot <= squaredLength;
};

export const isPointInQuad = (point, quad) => {
  let inside = false;

  for (let index = 0, previous = quad.length - 1; index < quad.length; previous = index, index += 1) {
    const currentPoint = quad[index];
    const previousPoint = quad[previous];

    if (isPointOnSegment(point, previousPoint, currentPoint)) {
      return true;
    }

    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;

    if (crosses) {
      inside = !inside;
    }
  }

  return inside;
};

const getPixelBrightness = (data, index) => {
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
};

export const computeMaskedFeatureFromImageData = ({
  data,
  width,
  height,
  offsetX = 0,
  offsetY = 0,
  quad,
  handBounds,
}) => {
  let brightnessSum = 0;
  let brightnessSquareSum = 0;
  let edgeHits = 0;
  let pixelCount = 0;
  let handPixelCount = 0;
  let previousBrightness = null;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const point = { x: offsetX + x, y: offsetY + y };
      if (!isPointInQuad(point, quad)) {
        continue;
      }

      const index = (y * width + x) * 4;
      const brightness = getPixelBrightness(data, index);
      brightnessSum += brightness;
      brightnessSquareSum += brightness * brightness;
      pixelCount += 1;

      if (previousBrightness !== null && Math.abs(brightness - previousBrightness) > 18) {
        edgeHits += 1;
      }
      previousBrightness = brightness;

      if (
        handBounds &&
        point.x >= handBounds.left &&
        point.x <= handBounds.right &&
        point.y >= handBounds.top &&
        point.y <= handBounds.bottom
      ) {
        handPixelCount += 1;
      }
    }
  }

  const safePixelCount = Math.max(1, pixelCount);
  const meanBrightness = brightnessSum / safePixelCount;
  const variance = brightnessSquareSum / safePixelCount - meanBrightness * meanBrightness;

  return {
    brightness: Number(meanBrightness.toFixed(4)),
    variance: Number(variance.toFixed(4)),
    edgeDensity: Number((edgeHits / safePixelCount).toFixed(4)),
    overlapWithHand: Number((handPixelCount / safePixelCount).toFixed(4)),
    pixelCount,
  };
};
