import gridDisplay from './gridDisplay.frag.wgsl';
import fullscreenTexturedQuad from '../../shaders/fullscreenTexturedQuad.wgsl';
import GridDisplayRenderer from './gridDisplay';
import { SampleInit, makeSample } from '../../components/SampleLayout';
import { image_data } from './data';
import { createBindGroupCluster } from './utils';

enum ActivationEnum {
  RELU,
  SIGMOID,
}
type ActivationType = 'RELU' | 'SIGMOID';
type FilterType = 'LEFT_EDGE' | 'RIGHT_EDGE' | 'TOP_EDGE' | 'BOTTOM_EDGE';

interface GUISettings {
  Value: number;
  'Input Shape': string;
  'Filter Shape': string;
  'Output Shape': string;
  Stride: number;
  'Filter Type': FilterType;
  'Activation Function': ActivationType;
}

const init: SampleInit = async ({ canvas, pageState, gui }) => {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  if (!pageState.active) return;
  const context = canvas.getContext('webgpu') as GPUCanvasContext;
  const devicePixelRatio = window.devicePixelRatio;
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });

  const settings: GUISettings = {
    Value: 0,
    'Input Shape': '28x28',
    'Filter Shape': '3x3',
    'Output Shape': '24x24',
    Stride: 2,
    'Filter Type': 'TOP_EDGE',
    'Activation Function': 'RELU',
  };

  const zeroImageData = image_data.mnist.data[0].image;

  const numberTextureSize: GPUExtent3DStrict = {
    width: 28,
    height: 28,
    depthOrArrayLayers: 1,
  };

  const numberStorageTexture = device.createTexture({
    size: numberTextureSize,
    format: 'r32float',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
  });

  const numberBuffer = device.createBuffer({
    size:
      Float32Array.BYTES_PER_ELEMENT *
      numberTextureSize.width *
      numberTextureSize.height,
    usage: GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
  });

  const sampler = device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
  });

  const bgCluster = createBindGroupCluster(
    [0, 1],
    [GPUShaderStage.FRAGMENT, GPUShaderStage.FRAGMENT],
    ['texture', 'sampler'],
    [{type: ''}]

  )

  new Float32Array(numberBuffer.getMappedRange()).set(zeroImageData);
  numberBuffer.unmap();

  const commandEncoder = device.createCommandEncoder();

  const bytesPerRow =
    Math.ceil((28 * Float32Array.BYTES_PER_ELEMENT) / 256) * 256;

  commandEncoder.copyBufferToTexture(
    { buffer: numberBuffer, bytesPerRow: bytesPerRow },
    { texture: numberTexture, mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
    numberTextureSize
  );

  const commands = commandEncoder.finish();
  device.queue.submit([commands]);

  gui.add(settings, 'Value', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  gui.add(settings, 'Input Shape');
  gui.add(settings, 'Output Shape');
  gui.add(settings, 'Stride');

  function frame() {
    if (!pageState.active) return;

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};

const convolutionExample: () => JSX.Element = () =>
  makeSample({
    name: 'Convolution',
    description: 'WIP convolution example',
    init,
    gui: true,
    sources: [
      {
        name: __filename.substring(__dirname.length + 1),
        contents: __SOURCE__,
      },
      GridDisplayRenderer.sourceInfo,
      {
        name: '../../../shaders/fullscreenTexturedQuad.vert.wgsl',
        contents: fullscreenTexturedQuad,
      },
      {
        name: './bitonicDisplay.frag.wgsl',
        contents: gridDisplay,
      },
    ],
    filename: __filename,
  });

export default convolutionExample;
