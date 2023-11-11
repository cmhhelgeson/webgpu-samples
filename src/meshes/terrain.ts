import { Vec3 } from "wgpu-matrix";

const TER_TERRAIN_VX = 251;
const TER_TERRAIN_VY = 251;
const TER_TERRAIN_TILE_SIZE = 0.5;

interface TerrainDescriptor {
  width: number;
  depth: number;
  tileSize: number;
  vertexBuffer?: GPUBuffer;
  indexBuffer?: GPUBuffer;
  heightSamplePoints?: number[];
}

const calculateWeightedVectorMagnitude = (
  p: Vec3,
  xAxis: number,
  yAxis: number,
  zAxis: number
) => {
  const [px, py, pz] = p;
  return Math.sqrt(px * px * xAxis + py * py * yAxis + pz * pz * zAxis);
}

const getHeightsFromTexture = (heightmap: GPUTexture, terrain: TerrainDescriptor) => {
  

  
}

const normalizeTerrainVector = (p: Vec3) => {
  const magnitude: number = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  if (magnitude > 0) {
    p[0] /= magnitude;
    p[1] /= magnitude;
    p[2] /= magnitude;
  }
}

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


}

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