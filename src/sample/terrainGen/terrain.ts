import { createBindGroupCluster } from './utils';
import heightsFromTextureWGSL from './heightsFromTexture.wgsl';

import { Vec3 } from 'wgpu-matrix';

// We're going to make our default sizes very friendly for the GPU
// Later down the road we can add checks and conditionals for arbitrary sizes
// But for now, 256 by 256 should be just fine, and it matches our heightmap dims
export const DEFAULT_TERRAIN_WIDTH = 256;
export const DEFAULT_TERRAIN_DEPTH = 256;
export const DEFAULT_TERRAIN_TILE_SIZE = 0.5;

interface TerrainDescriptorConstructorArgs {
  heightmap: GPUTexture;
  width?: number;
  depth?: number;
  tileSize?: number;
}

export class TerrainDescriptor {
  // Instance properties
  width: number;
  depth: number;
  tileSize: number;
  heightMap: GPUTexture;
  setHeightsBindGroup: GPUBindGroup;
  vertexBuffer?: GPUBuffer;
  indexBuffer?: GPUBuffer;
  heightsBuffer?: GPUBuffer;

  // Static properties
  static setHeightsBGLayout: GPUBindGroupLayout;
  static setHeightsPipeline: GPUComputePipeline;
  static terrainUniformsBuffer: GPUBuffer;

  static initStaticProperties(device: GPUDevice) {
    TerrainDescriptor.setHeightsBGLayout = device.createBindGroupLayout({
      label: `SetHeights.bindGroupLayout`,
      entries: [
        // Heightmap Texture
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: {
            viewDimension: '2d',
          },
        },
        // Heights Storage Buffer
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
        // Uniforms Buffer
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
      ],
    });
    TerrainDescriptor.terrainUniformsBuffer = device.createBuffer({
      size: Float32Array.BYTES_PER_ELEMENT * 2,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    TerrainDescriptor.setHeightsPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        label: `SetHeights.pipelineLayout`,
        bindGroupLayouts: [TerrainDescriptor.setHeightsBGLayout],
      }),
      compute: {
        entryPoint: 'heightsFromTextureComputeMain',
        module: device.createShaderModule({
          code: heightsFromTextureWGSL,
        }),
      },
    });
  }

  constructor(device: GPUDevice, args: TerrainDescriptorConstructorArgs) {
    this.width = args.width ? args.width : DEFAULT_TERRAIN_WIDTH;
    this.depth = args.depth ? args.depth : DEFAULT_TERRAIN_DEPTH;
    this.tileSize = args.tileSize ? args.tileSize : DEFAULT_TERRAIN_TILE_SIZE;
    this.heightMap = args.heightmap;
    this.heightsBuffer = device.createBuffer({
      size: Float32Array.BYTES_PER_ELEMENT * this.width * this.depth,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.setHeightsBindGroup = device.createBindGroup({
      layout: TerrainDescriptor.setHeightsBGLayout,
      entries: [
        {
          binding: 0,
          resource: this.heightMap.createView(),
        },
        {
          binding: 1,
          resource: {
            buffer: this.heightsBuffer,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: TerrainDescriptor.terrainUniformsBuffer,
          },
        },
      ],
    });
  }

  setHeightsBuffer(device: GPUDevice) {
    device.queue.writeBuffer(
      TerrainDescriptor.terrainUniformsBuffer,
      0,
      new Float32Array([this.width, this.depth])
    );
    const commandEncoder = device.createCommandEncoder();
    const computePassEncoder = commandEncoder.beginComputePass();
    computePassEncoder.setPipeline(TerrainDescriptor.setHeightsPipeline);
    computePassEncoder.setBindGroup(0, this.setHeightsBindGroup);
    // Texture height is 65536 (make caluclations for different texture sizes later)
    // We can address each pixel with 16x16 invocations and 16x16 workgroups
    computePassEncoder.dispatchWorkgroups(16, 16, 1);
    computePassEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  async getHeights(device: GPUDevice): Promise<Float32Array> {
    const heightsBufferSize =
      Float32Array.BYTES_PER_ELEMENT * this.width * this.depth;
    const heightsStagingBuffer = device.createBuffer({
      size: Float32Array.BYTES_PER_ELEMENT * this.width * this.depth,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(
      this.heightsBuffer,
      0,
      heightsStagingBuffer,
      0,
      heightsBufferSize
    );
    await heightsStagingBuffer.mapAsync(GPUMapMode.READ, 0, heightsBufferSize);
    const copyHeightsBuffer = heightsStagingBuffer.getMappedRange(
      0,
      heightsBufferSize
    );
    // Get correct range of data from CPU copy of GPU Data
    const heightsData = copyHeightsBuffer.slice(
      0,
      Float32Array.BYTES_PER_ELEMENT * this.width * this.depth
    );
    // Extract data
    const heightsOutput = new Float32Array(heightsData);
    heightsStagingBuffer.unmap();
    return heightsOutput;
  }
}

const calculateWeightedVectorMagnitude = (
  p: Vec3,
  xAxis: number,
  yAxis: number,
  zAxis: number
) => {
  const [px, py, pz] = p;
  return Math.sqrt(px * px * xAxis + py * py * yAxis + pz * pz * zAxis);
};

const getHeightsFromTexture = (
  heightmap: GPUTexture,
  terrain: TerrainDescriptor
) => {};

const normalizeTerrainVector = (p: Vec3) => {
  const magnitude: number = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  if (magnitude > 0) {
    p[0] /= magnitude;
    p[1] /= magnitude;
    p[2] /= magnitude;
  }
};

export const calculateTerrainNormal = (
  terrain: TerrainDescriptor,
  x: number,
  z: number
) => {
  if (x === 0) {
    x = 1;
  }
  if (z === 0) {
    z = 1;
  }
};

export const createTerrainMesh = (terrain: TerrainDescriptor) => {
  //Potentially set texture heights in the build mesh step, or allow dynamic height displacement

  for (let widthSeg = 0; widthSeg < terrain.width; widthSeg++) {
    for (let depthSeg = 0; depthSeg < terrain.depth; depthSeg++) {
      //Static height for now at 0.1
      const vertex = new Float32Array([
        widthSeg * terrain.tileSize,
        0.1,
        -depthSeg * terrain.tileSize,
      ]);
    }
  }

  const vertices = [];
  const normals = [];
};

interface ClipVolume {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

// Get the raw values of the pixels in each heightmap as a linear array of values
export const setHeightFromHeightmap = (
  device: GPUDevice,
  terrains: TerrainDescriptor
) => {
  // Get size of heightMap (currently assuming static size)
  const heightsBufferSize =
    heightmaps[0].width * heightmaps[0].height * Float32Array.BYTES_PER_ELEMENT;

  // Get shader GPU output buffer, staging buffer, and uniforms buffer
  const heightsOutputBuffer = device.createBuffer({
    size: heightsBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const heightsStagingBuffer = device.createBuffer({
    size: heightsBufferSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const terrainUniformsBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * 2,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const heightsFromTextureLabel = 'HeightsFromTexture';

  const bgResources = heightmaps.map((hm) => {
    return [
      hm.createView(),
      { buffer: heightsOutputBuffer },
      { buffer: terrainUniformsBuffer },
    ];
  });

  const heightsFromTextureBGCluster = createBindGroupCluster(
    [0, 1, 2],
    [GPUShaderStage.COMPUTE],
    ['texture', 'buffer', 'buffer'],
    [{ viewDimension: '2d' }, { type: 'storage' }, { type: 'uniform' }],
    bgResources,
    heightsFromTextureLabel,
    device
  );

  const heightsFromTexturePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      label: `${heightsFromTextureLabel}.pipelineLayout`,
      bindGroupLayouts: [heightsFromTextureBGCluster.bindGroupLayout],
    }),
    compute: {
      entryPoint: 'heightsFromTextureComputeMain',
      module: device.createShaderModule({
        code: heightsFromTextureWGSL,
      }),
    },
  });

  for (let i = 0; i < heightmaps.length; i++) {
    const commandEncoder = device.createCommandEncoder();
    const computePassEncoder = commandEncoder.beginComputePass();
    computePassEncoder.setBindGroup(
      0,
      heightsFromTextureBGCluster.bindGroups[i]
    );
    // Texture height is 65536 (make caluclations for different texture sizes later)
    // We can address each pixel with 16x16 invocations and 16x16 workgroups
    computePassEncoder.dispatchWorkgroups(16, 16, 1);
  }
};
