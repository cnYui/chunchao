const solveLinearSystem = (matrix, vector) => {
  const size = matrix.length;
  const augmented = matrix.map((row, rowIndex) => [...row, vector[rowIndex]]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot;

    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) {
        maxRow = row;
      }
    }

    [augmented[pivot], augmented[maxRow]] = [augmented[maxRow], augmented[pivot]];

    const divisor = augmented[pivot][pivot];
    if (Math.abs(divisor) < 1e-9) {
      throw new Error('Cannot solve homography');
    }

    for (let col = pivot; col <= size; col += 1) {
      augmented[pivot][col] /= divisor;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }

      const factor = augmented[row][pivot];
      for (let col = pivot; col <= size; col += 1) {
        augmented[row][col] -= factor * augmented[pivot][col];
      }
    }
  }

  return augmented.map((row) => row[size]);
};

export const createProjectiveTransform = ({ source, target }) => {
  const matrix = [];
  const vector = [];

  source.forEach((point, index) => {
    const mapped = target[index];
    matrix.push([point.x, point.y, 1, 0, 0, 0, -mapped.x * point.x, -mapped.x * point.y]);
    vector.push(mapped.x);
    matrix.push([0, 0, 0, point.x, point.y, 1, -mapped.y * point.x, -mapped.y * point.y]);
    vector.push(mapped.y);
  });

  const [a, b, c, d, e, f, g, h] = solveLinearSystem(matrix, vector);

  return { a, b, c, d, e, f, g, h };
};

export const mapPoint = (transform, point) => {
  const denominator = transform.g * point.x + transform.h * point.y + 1;
  const x = (transform.a * point.x + transform.b * point.y + transform.c) / denominator;
  const y = (transform.d * point.x + transform.e * point.y + transform.f) / denominator;

  return {
    x: Number(x.toFixed(6)),
    y: Number(y.toFixed(6)),
  };
};

export const mapDomRectToQuad = (transform, rect) => {
  return [
    mapPoint(transform, { x: rect.left, y: rect.top }),
    mapPoint(transform, { x: rect.right, y: rect.top }),
    mapPoint(transform, { x: rect.right, y: rect.bottom }),
    mapPoint(transform, { x: rect.left, y: rect.bottom }),
  ];
};
