import { createBindGroupCluster } from './utils';
import heightsFromTextureWGSL from './heightsFromTexture.wgsl';

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

  //Commandencoder.copyBuffer ..etc
};

interface TerrainPoint {
  x: number;
  z: number;
}

interface CreateFaultFormationArgs {
  terrainSize: number;
  iterations: number;
  minHeight: number;
  maxHeight: number;
  heightOffsets: Float32Array;
}

export const createFaultFormation = (args: CreateFaultFormationArgs) => {
  const { terrainSize, iterations, minHeight, maxHeight, heightOffsets } = args;
  heightOffsets.fill(0.0);
  const heightRange = maxHeight - minHeight;
  for (let iter = 0; iter < iterations; iter++) {
    const iterationRatio = iter / iterations;
    const height = maxHeight - iterationRatio * heightRange;
    // Generate random terrain points
    const p1: TerrainPoint = {
      x: 0.0,
      z: 0.0,
    };
    const p2: TerrainPoint = {
      x: 0.0,
      z: 0.0,
    };
    p1.x = Math.floor(Math.random() * terrainSize);
    p1.z = Math.floor(Math.random() * terrainSize);

    let counter = 0;
    do {
      p2.x = Math.floor(Math.random() * terrainSize);
      p2.z = Math.floor(Math.random() * terrainSize);
      if (counter === 1000) {
        break;
      }
      counter++;
    } while (p1.x === p2.x && p1.z === p2.z);

    // Get deltas along x and z axis
    const dirX = p2.x - p1.x;
    const dirZ = p2.z - p1.x;

    // Increment height of points on one side of fault line while keeping other side unchanged.
    // Cross product determines wether point is on a given side of line
    for (let z = 0; z < terrainSize; z++) {
      for (let x = 0; x < terrainSize; x++) {
        // Calculate vector from currentPoint to generated random point
        const xIn = x - p1.x;
        const zIn = z - p1.z;
        // Get cross product
        const crossProduct = xIn * dirZ + zIn * dirX;
        // If point is on one half of line
        heightOffsets[z * terrainSize + x] += crossProduct > 0 ? height : 0;
      }
    }
  }
  normalizeArray(heightOffsets, args.minHeight, args.maxHeight);
};

export const normalizeArray = (
  arr: Float32Array,
  minRange: number,
  maxRange: number
) => {
  const min = Math.min(...arr);
  const max = Math.max(...arr);

  const minMaxDelta = max - min;
  const minMaxRange = maxRange - minRange;
  for (let i = 0; i < arr.length; i++) {
    arr[i] = ((arr[i] - min) / minMaxDelta) * minMaxRange + minRange;
  }
};
