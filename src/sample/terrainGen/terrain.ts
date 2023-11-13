// We're going to make our default sizes very friendly for the GPU
// Later down the road we can add checks and conditionals for arbitrary sizes

import { createBindGroupCluster } from './utils';
import heightsFromTextureWGSL from './heightsFromTexture.wgsl';
import { Mesh } from '../../meshes/mesh';
import { vec3 } from 'wgpu-matrix';

interface TerrainDescriptorConstructorArgs {
  width: number;
  depth: number;
  tileSize?: number;
}

export class TerrainDescriptor {
  // Instance properties
  width: number;
  depth: number;
  tileSize: number;

  constructor(args: TerrainDescriptorConstructorArgs) {
    this.width = args.width;
    this.depth = args.depth;
    this.tileSize = args.tileSize;
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

  //Commandencoder.copyBuffer ..etc
};
//  Example 3x3 Terrain Grid
//                      ____________________________
//                     /         /       /         /
//                   /         /       /         /
//                 /         /       /         /
//                _____________________________
//              /         /        /         /
//            /         /        /         /
//          /         /        /         /   ^
//        /_____________________________    /
//       /        /         /         /    z (depth)
//     /        /         /         /     /
//   /        /         /         /      /
// /________/_________/_________/
//        <--- x (width) --->

export const createTerrainMesh = (
  t: TerrainDescriptor,
  heights: Float32Array
): Mesh => {
  // position: vec3f
  const f32sPerVertex = 3;
  const vertices = new Float32Array(t.width * t.depth * f32sPerVertex);
  const vertexStride = Float32Array.BYTES_PER_ELEMENT * f32sPerVertex;
  const vertexLayout: GPUVertexFormat[] = ['float32x3'];

  let positionIndex = 0;
  for (let z = 0; z < t.depth; z++) {
    for (let x = 0; x < t.width; x++) {
      vertices[positionIndex++] = x;
      vertices[positionIndex++] = heights[z * t.width + x];
      vertices[positionIndex++] = z;
    }
  }
  const numQuads = (t.width - 1) * (t.depth - 1);
  const numIndices = numQuads * 6;
  const indices = new Uint16Array(numIndices);
  let indicesIndex = 0;
  //  (z+1)*w+x        (z+1)*w+x+1   3                 4                  5
  //    __________________           __________________ __________________
  //   |                /           |                 ||                 |
  //   |            /    |          |                 ||                 |
  //   |        /        |          |                 ||                 |
  //   |     /           |          |                 ||                 |
  //   |  /              |          |                 ||                 |
  //   |_________________|          |_________________||_________________|
  //  z*w+x         (z+1)*w+x       0                  1                  2
  //
  for (let z = 0; z < t.depth - 1; z++) {
    for (let x = 0; x < t.width - 1; x++) {
      const nextZ = z + 1;
      const nextX = x + 1;

      const bottomLeft = z * t.width + x;
      const topLeft = nextZ * t.width + x;
      const topRight = nextZ * t.width + nextX;
      const bottomRight = z * t.width + nextX;

      // Left triangle
      indices[indicesIndex++] = bottomLeft;
      indices[indicesIndex++] = topLeft;
      indices[indicesIndex++] = topRight;

      // Right triangle
      indices[indicesIndex++] = bottomLeft;
      indices[indicesIndex++] = topRight;
      indices[indicesIndex++] = bottomRight;
    }
  }

  const terrainMesh: Mesh = {
    vertices,
    vertexStride,
    indices,
    vertexLayout,
  };
  return terrainMesh;
};
