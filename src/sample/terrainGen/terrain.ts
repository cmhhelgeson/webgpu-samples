// We're going to make our default sizes very friendly for the GPU
// Later down the road we can add checks and conditionals for arbitrary sizes

import { createBindGroupCluster } from './utils';
import heightsFromTextureWGSL from './heightsFromTexture.wgsl';
import { Mesh } from '../../meshes/mesh';

// But for now, 256 by 256 should be just fine, and it matches our heightmap dims
export const DEFAULT_TERRAIN_WIDTH = 256;
export const DEFAULT_TERRAIN_DEPTH = 256;
export const DEFAULT_TERRAIN_TILE_SIZE = 0.5;

interface TerrainDescriptorConstructorArgs {
  width?: number;
  depth?: number;
  tileSize?: number;
}

export class TerrainDescriptor {
  // Instance properties
  width: number;
  depth: number;
  tileSize: number;

  constructor(args: TerrainDescriptorConstructorArgs) {
    this.width = args.width ? args.width : DEFAULT_TERRAIN_WIDTH;
    this.depth = args.depth ? args.depth : DEFAULT_TERRAIN_DEPTH;
    this.tileSize = args.tileSize ? args.tileSize : DEFAULT_TERRAIN_TILE_SIZE;
  }
}

export const getHeightsFromTexture = (
  device: GPUDevice,
  bitmap: ImageBitmap,
  method: 'CPU' | 'GPU'
) => {
  if (method === 'CPU') {
    return getHeightsCPU(bitmap);
  }
  getHeightsGPU(device, bitmap);
};

const getHeightsCPU = (bitmap: ImageBitmap) => {
  const offscreenCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = offscreenCanvas.getContext('2d');

  // Draw the ImageBitmap onto the OffscreenCanvas
  ctx.drawImage(bitmap, 0, 0);

  // Get the image data from the OffscreenCanvas
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

  // Create an ArrayBuffer to hold the normalized pixel data
  const floatArray = new Float32Array(bitmap.width * bitmap.height);

  // Convert and normalize pixel data (only getting r components)
  for (let i = 0; i < imageData.data.length / 4; i++) {
    floatArray[i] = imageData.data[i * 4] / 127.5; // Normalize to 0.0 - 1.0
  }
  return floatArray;
};

const getHeightsGPU = async (device: GPUDevice, bitmap: ImageBitmap) => {
  // Currently doesn't seem to work but will include here for when I figure out how to fix it
  // @group(0) @binding(0)
  const heightMapTexture = device.createTexture({
    size: {
      width: bitmap.width,
      height: bitmap.height,
    },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING,
  });

  // @group(0) @binding(1)
  const heightsBuffer = device.createBuffer({
    size: bitmap.width * bitmap.height * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  // @group(0) @binding(2)
  const uniformsBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * 2,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bgCluster = createBindGroupCluster(
    [0, 1, 2],
    [GPUShaderStage.COMPUTE],
    ['texture', 'buffer', 'buffer'],
    [
      { viewDimension: '2d', sampleType: 'unfilterable-float' },
      { type: 'storage' },
      { type: 'uniform' },
    ],
    [
      [
        heightMapTexture.createView(),
        { buffer: heightsBuffer },
        { buffer: uniformsBuffer },
      ],
    ],
    'SetHeights',
    device
  );

  const pipeline = device.createComputePipeline({
    label: 'SetHeights.pipeline',
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bgCluster.bindGroupLayout],
    }),
    compute: {
      entryPoint: 'heightsFromTextureComputeMain',
      module: device.createShaderModule({
        code: heightsFromTextureWGSL,
      }),
    },
  });

  device.queue.writeBuffer(
    uniformsBuffer,
    0,
    new Uint32Array([bitmap.width, bitmap.height])
  );

  const commandEncoder = device.createCommandEncoder();
  const computePassEncoder = commandEncoder.beginComputePass();
  computePassEncoder.setPipeline(pipeline);
  computePassEncoder.setBindGroup(0, bgCluster.bindGroups[0]);
  computePassEncoder.dispatchWorkgroups(16, 16, 1);
  computePassEncoder.end();
  device.queue.submit([commandEncoder.finish()]);

  //Commandencoder.copyBuffer
};

export const createTerrainMesh = (
  t: TerrainDescriptor,
  heights: Float32Array
): Mesh => {
  const getTerrain = (w: number, d: number) => {
    return heights[w * t.depth + d];
  };

  const calculateNormal = (x: number, z: number) => {
    x = x === 0 ? 1 : x;
    z = z === 0 ? 1 : z;
    const hl: number = getTerrain(x - 1, z);
    const hr: number = getTerrain(x + 1, z);
    const hd: number = getTerrain(x, z + 1); /* Terrain expands towards -Z */
    const hu: number = getTerrain(x, z - 1);
    const normal = [hl - hr, 2.0, hd - hu];
    const magnitude =
      normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2];
    normal[0] /= magnitude;
    normal[1] /= magnitude;
    normal[2] /= magnitude;
    return normal;
  };

  const populateIndices = (indices: Uint16Array) => {
    const x0 = 0.0;
    const x1 = (t.width - 1) * t.tileSize;
    const z0 = 0.0;
    const z1 = (t.depth - 1) * DEFAULT_TERRAIN_TILE_SIZE;

    const minCol = Math.max(Math.min(x0 / t.tileSize, t.width - 2), 0);
    const maxCol = Math.max(
      Math.min((x1 + t.tileSize) / t.tileSize, t.width - 2),
      0
    );

    /* Z1 is always largest, because our terrain grows towrds -Z, it means that
     * it defines the min_row
     */
    const minRow = Math.max(Math.min(-z1 / t.tileSize, t.depth - 1), 0);
    const maxRow = Math.max(
      Math.min(-(z0 - t.tileSize) / t.tileSize, t.depth - 1),
      0
    );

    /* If this happens then the terrain is not visible */
    if (minCol == maxCol || minRow == maxRow) {
      return;
    }

    let index = 0;
    for (let c = minCol; c <= maxCol; c++) {
      for (let r = minRow; r <= maxRow; r++) {
        /* If this is not the first strip then we need to produce a degenerate
         * link with the previous strip using the first vertex from this strip
         * and the last vertex from the last before we start recording the
         * new strip. Here is the first vertex of this strip.
         */
        if (c > minCol && r == minRow) indices[index++] = c * t.depth + r;

        indices[index++] = c * t.depth + r;
        indices[index++] = (c + 1) * t.depth + r;

        /* Link the next triangle strip using degenerate triangles. For that
         * we need to duplicate the last vertex of this strip and the first
         * vertex of the next.
         */
        if (r == maxRow && c < maxCol) indices[index++] = (c + 1) * t.depth + r;
      }
    }
  };

  const vertNormalBuffer: number[] = [];

  for (let wSeg = 0; wSeg < t.width; wSeg++) {
    for (let dSeg = 0; dSeg < t.depth; dSeg++) {
      const py = getTerrain(wSeg, dSeg);
      const vertex = [wSeg * t.tileSize, py, -dSeg * t.tileSize];
      const normal = calculateNormal(wSeg, dSeg);
      vertNormalBuffer.push(...vertex);
      vertNormalBuffer.push(...normal);
    }
  }
  const numIndices =
    (t.width - 1) * (t.depth * 2) + (t.width - 2) + (t.depth - 2);
  const indices = new Uint16Array(numIndices);
  populateIndices(indices);

  const terrainMesh: Mesh = {
    vertices: new Float32Array(vertNormalBuffer),
    vertexStride: Float32Array.BYTES_PER_ELEMENT * 3 * 2,
    indices: indices,
  };
  return terrainMesh;
};
