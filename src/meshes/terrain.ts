import { Mesh } from './mesh';

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
    this.tileSize = args.tileSize ? args.tileSize : 0.5;
  }
}

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
  const indices = new Uint32Array(numIndices);
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
