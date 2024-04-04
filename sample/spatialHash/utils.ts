import { Renderable } from '../../meshes/mesh';
import { createSphereMesh } from '../../meshes/sphere';

export const createSphereRenderable = (
  device: GPUDevice,
  radius: number,
  widthSegments = 32,
  heightSegments = 16,
  randomness = 0
): Renderable => {
  const sphereMesh = createSphereMesh(
    radius,
    widthSegments,
    heightSegments,
    randomness
  );

  // Create a vertex buffer from the sphere data.
  const vertexBuffer = device.createBuffer({
    size: sphereMesh.vertices.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(vertexBuffer.getMappedRange()).set(sphereMesh.vertices);
  vertexBuffer.unmap();

  const indexBuffer = device.createBuffer({
    size: sphereMesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX,
    mappedAtCreation: true,
  });
  new Uint16Array(indexBuffer.getMappedRange()).set(sphereMesh.indices);
  indexBuffer.unmap();

  return {
    vertexBuffer,
    indexBuffer,
    indexCount: sphereMesh.indices.length,
  };
};
