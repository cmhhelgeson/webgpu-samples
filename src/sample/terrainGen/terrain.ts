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
  vertexBuffer?: GPUBuffer;
  indexBuffer?: GPUBuffer;
  heightsBuffer?: GPUBuffer;

  constructor(device: GPUDevice, args: TerrainDescriptorConstructorArgs) {
    this.width = args.width ? args.width : DEFAULT_TERRAIN_WIDTH;
    this.depth = args.depth ? args.depth : DEFAULT_TERRAIN_DEPTH;
    this.tileSize = args.tileSize ? args.tileSize : DEFAULT_TERRAIN_TILE_SIZE;
    this.heightMap = args.heightmap;
    this.heightsBuffer = device.createBuffer({
      size: Float32Array.BYTES_PER_ELEMENT * this.width * this.depth,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
  }
}

/*const calculateWeightedVectorMagnitude = (
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
} */