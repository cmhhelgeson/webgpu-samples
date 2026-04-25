export default {
  name: 'Prefix Sum',
  description:
    "A prefix sum algorithm executed on the GPU and making use of subgroup operations. Based on b0nes164's implementation at <https://github.com/b0nes164/GPUPrefixSums>. Prefix Sum shaders are modified from the output of Three.js TSL Shaders.",
  filename: __DIRNAME__,
  sources: [
    { path: 'main.ts' },
    { path: 'prefixSumDisplay.ts' },
    { path: '../../shaders/fullscreenTexturedQuad.wgsl' },
    { path: './prefixSumDisplay.frag.wgsl' },
    { path: './computeShaders/commons.wgsl' },
    { path: './computeShaders/reduce.wgsl' },
    { path: './computeShaders/spineScanShort.wgsl' },
    { path: './computeShaders/spineScanLong.wgsl' },
    { path: './computeShaders/downsweep.wgsl' },
  ],
};
