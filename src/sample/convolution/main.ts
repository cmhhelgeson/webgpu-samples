import display from './display.frag.wgsl';
import fullscreenTexturedQuad from '../../shaders/fullscreenTexturedQuad.wgsl';
import DisplayRenderer from './display';
import initialWrite from './initialWrite.compute.wgsl';
import { SampleInit, makeSample } from '../../components/SampleLayout';
import { MnistData } from './data';
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

  let rawNumberData = MnistData.data[settings.Value].image;

  const numberTextureSize: GPUExtent3DStrict = {
    width: 28,
    height: 28,
    depthOrArrayLayers: 1,
  };

  // Texture will be used as both writable 2d storage texture and input texture
  // texture_2d<format, read_write> currently experimental
  const numberTexture = device.createTexture({
    size: numberTextureSize,
    format: 'r32float',
    usage:
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const numberBuffer = device.createBuffer({
    size:
      Float32Array.BYTES_PER_ELEMENT *
      numberTextureSize.width *
      numberTextureSize.height,
    usage:
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });

  const sampler = device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
  });

  const initialWriteBGCluster = createBindGroupCluster(
    [0, 1],
    [GPUShaderStage.COMPUTE, GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT],
    ['buffer', 'storageTexture'],
    [
      { type: 'read-only-storage' },
      {
        format: numberTexture.format,
        access: 'write-only',
        viewDimension: '2d',
      },
    ],
    [[{ buffer: numberBuffer }, numberTexture.createView()]],
    'InitialWrite',
    device
  );

  const initialWritePipeline = device.createComputePipeline({
    label: 'InitialWrite.pipeline',
    layout: device.createPipelineLayout({
      bindGroupLayouts: [initialWriteBGCluster.bindGroupLayout],
    }),
    compute: {
      entryPoint: 'initialWriteComputeMain',
      module: device.createShaderModule({
        code: initialWrite,
      }),
    },
  });

  new Float32Array(numberBuffer.getMappedRange()).set(rawNumberData);
  numberBuffer.unmap();

  const initEncoder = device.createCommandEncoder();
  const computePassEncoder = initEncoder.beginComputePass();
  computePassEncoder.setPipeline(initialWritePipeline);
  computePassEncoder.setBindGroup(0, initialWriteBGCluster.bindGroups[0]);
  computePassEncoder.dispatchWorkgroups(7, 7);
  computePassEncoder.end();
  device.queue.submit([initEncoder.finish()]);

  const displayBGCluster = createBindGroupCluster(
    [0],
    [GPUShaderStage.FRAGMENT],
    ['texture'],
    [{ viewDimension: '2d', sampleType: 'unfilterable-float' }],
    [[numberTexture.createView()]],
    'Display',
    device
  );

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: undefined, // Assigned later

        clearValue: { r: 0.1, g: 0.4, b: 0.5, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  const displayRenderer = new DisplayRenderer(
    device,
    presentationFormat,
    renderPassDescriptor,
    displayBGCluster,
    'Display'
  );

  gui.add(settings, 'Value', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).onChange(() => {
    rawNumberData = MnistData.data[settings.Value].image;
    device.queue.writeBuffer(
      numberBuffer,
      0,
      new Float32Array([...rawNumberData])
    );

    const commandEncoder = device.createCommandEncoder();
    const computePassEncoder = commandEncoder.beginComputePass();
    computePassEncoder.setPipeline(initialWritePipeline);
    computePassEncoder.setBindGroup(0, initialWriteBGCluster.bindGroups[0]);
    computePassEncoder.dispatchWorkgroups(7, 7);
    computePassEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
  });
  gui.add(settings, 'Input Shape');
  gui.add(settings, 'Output Shape');
  gui.add(settings, 'Stride');

  function frame() {
    if (!pageState.active) return;
    renderPassDescriptor.colorAttachments[0].view = context
      .getCurrentTexture()
      .createView();

    const commandEncoder = device.createCommandEncoder();
    displayRenderer.startRun(commandEncoder);
    device.queue.submit([commandEncoder.finish()]);
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
      DisplayRenderer.sourceInfo,
      {
        name: '../../../shaders/fullscreenTexturedQuad.vert.wgsl',
        contents: fullscreenTexturedQuad,
      },
      {
        name: './display.frag.wgsl',
        contents: display,
      },
    ],
    filename: __filename,
  });

export default convolutionExample;
