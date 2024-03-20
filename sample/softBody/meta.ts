export default {
  name: 'XPCD Soft Body',
  description: ``,
  filename: __DIRNAME__,
  sources: [
    { path: 'main.ts' },
    { path: 'vertexWriteGBuffers.wgsl' },
    { path: 'fragmentWriteGBuffers.wgsl' },
    { path: 'vertexTextureQuad.wgsl' },
    { path: 'fragmentGBuffersDebugView.wgsl' },
    { path: 'fragmentDeferredRendering.wgsl' },
    { path: 'lightUpdate.wgsl' },
  ],
};
