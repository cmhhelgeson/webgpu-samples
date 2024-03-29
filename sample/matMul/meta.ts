export default {
  name: 'Matrix Multiplication',
  description:
    'DP4A Matrix Multiplication.',
  filename: __DIRNAME__,
  sources: [
    { path: 'main.ts' },
    { path: 'blur.wgsl' },
    { path: '../../shaders/fullscreenTexturedQuad.wgsl' },
  ],
};
