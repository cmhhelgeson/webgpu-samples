export const extractGPUData = async (
  debugBuffer: GPUBuffer,
  srcBufferSize: number
) => {
  await debugBuffer.mapAsync(GPUMapMode.READ, 0, srcBufferSize);
  const copyBuffer = debugBuffer.getMappedRange(0, srcBufferSize);
  return copyBuffer.slice(0, srcBufferSize);
};
