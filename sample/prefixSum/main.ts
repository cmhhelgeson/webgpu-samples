import { GUI } from 'dat.gui';
import { PrefixSum } from './PrefixSum';
import PrefixSumDisplayRenderer from './prefixSumDisplay';
import {
  quitIfAdapterNotAvailable,
  quitIfLimitLessThan,
  quitIfWebGPUNotAvailableOrMissingFeatures,
} from '../util';

type StepType =
  // RESET: Reset data buffer
  | 'RESET'
  // PREFIX SUM: Execute prefix sum
  | 'PREFIX_SUM';

// Gui settings object
interface SettingsInterface {
  'Total Elements': number;
  'Grid Width': number;
  'Grid Height': number;
  'Grid Dimensions': string;
  'Workgroup Size': number;
  'Prev Step': StepType;
  'Next Step': StepType;
  executeStep: boolean;
  'Log Elements': () => void;
  'Auto Sort': () => void;
  'Auto Sort Speed': number;
}

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const gui = new GUI();

const gpuNavigator = navigator.gpu;

const adapter = await navigator.gpu?.requestAdapter({
  featureLevel: 'compatibility',
});
quitIfAdapterNotAvailable(adapter);

const linearIndexingAvailable =
  gpuNavigator.wgslLanguageFeatures.has('linear-indexing');

const timestampQueryAvailable = adapter.features.has('timestamp-query');
const subgroupsAvailable = adapter.features.has('subgroups');
const features = [];
const limits: Record<string, GPUSize32> = {};
if (timestampQueryAvailable) {
  features.push('timestamp-query');
}
if (subgroupsAvailable) {
  features.push('subgroups');
}
quitIfLimitLessThan(adapter, 'maxStorageBuffersInFragmentStage', 1, limits);
const device = await adapter.requestDevice({
  requiredFeatures: features,
  requiredLimits: limits,
});
quitIfWebGPUNotAvailableOrMissingFeatures(adapter, device);

const context = canvas.getContext('webgpu');
const devicePixelRatio = window.devicePixelRatio;
canvas.width = canvas.clientWidth * devicePixelRatio;
canvas.height = canvas.clientHeight * devicePixelRatio;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format: presentationFormat,
});

const maxInvocationsX = device.limits.maxComputeWorkgroupSizeX;
console.log(maxInvocationsX);

const maxElements = 1048576;

const defaultGridWidth =
  Math.sqrt(maxElements) % 2 === 0
    ? Math.floor(Math.sqrt(maxElements))
    : Math.floor(Math.sqrt(maxElements / 2));

const defaultGridHeight = maxElements / defaultGridWidth;

const settings: SettingsInterface = {
  // TOTAL ELEMENT AND GRID SETTINGS
  // The number of elements to be sorted. Must equal gridWidth * gridHeight || Workgroup Size * Workgroups * 2.
  // When changed, all relevant values within the settings object are reset to their defaults at the beginning of a sort with n elements.
  'Total Elements': maxElements,
  // The width of the screen in cells.
  'Grid Width': defaultGridWidth,
  // The height of the screen in cells.
  'Grid Height': defaultGridHeight,
  // Grid Dimensions as string
  'Grid Dimensions': `${defaultGridWidth}x${defaultGridHeight}`,

  // INVOCATION, WORKGROUP SIZE, AND WORKGROUP DISPATCH SETTINGS
  // The size of a workgroup, or the number of invocations executed within each workgroup
  // Determined algorithmically based on 'Size Limit', maxInvocationsX, and the current number of elements to sort
  'Workgroup Size': maxInvocationsX,

  // The category of the previously executed step. Always begins the bitonic sort with a value of 'NONE' and ends with a value of 'DISPERSE_LOCAL'
  'Prev Step': 'RESET',
  // The category of the next step that will be executed. Always begins the bitonic sort with a value of 'FLIP_LOCAL' and ends with a value of 'NONE'
  'Next Step': 'PREFIX_SUM',

  // ANIMATION LOOP AND FUNCTION SETTINGS
  // A flag that designates whether we will dispatch a workload this frame.
  executeStep: false,
  // A function that logs the values of each element as an array to the browser's console.
  'Log Elements': () => {
    return;
  },
  // A function that automatically executes each step of the bitonic sort at an interval determined by 'Auto Sort Speed'
  'Auto Sort': () => {
    return;
  },
  // The speed at which each step of the bitonic sort will be executed after 'Auto Sort' has been called.
  'Auto Sort Speed': 500,
};

const TOTAL_ELEMENTS = settings['Total Elements'];
const elementsBufferSize = Uint32Array.BYTES_PER_ELEMENT * TOTAL_ELEMENTS;

let elements = new Uint32Array(TOTAL_ELEMENTS).fill(1);

const inputVecBuffer = device.createBuffer({
  label: 'PrefixSum.inputVecBuffer',
  size: elementsBufferSize,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
const outputBuffer = device.createBuffer({
  label: 'PrefixSum.outputBuffer',
  size: elementsBufferSize,
  usage:
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
});
const outputStagingBuffer = device.createBuffer({
  label: 'PrefixSum.outputStagingBuffer',
  size: elementsBufferSize,
  usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});

const displayUniformsBuffer = device.createBuffer({
  label: 'PrefixSum.displayUniformsBuffer',
  size: 2 * Float32Array.BYTES_PER_ELEMENT,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const displayBindGroupLayout = device.createBindGroupLayout({
  label: 'PrefixSumDisplay.bindGroupLayout',
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
      buffer: {
        type: 'read-only-storage',
      },
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      buffer: {
        type: 'uniform',
      },
    },
  ],
});

const displayBindGroup = device.createBindGroup({
  label: 'PrefixSumDisplay.bindGroup',
  layout: displayBindGroupLayout,
  entries: [
    {
      binding: 0,
      resource: { buffer: outputBuffer },
    },
    {
      binding: 1,
      resource: { buffer: displayUniformsBuffer },
    },
  ],
});

// Create bitonic debug renderer
const renderPassDescriptor: GPURenderPassDescriptor = {
  colorAttachments: [
    {
      view: undefined, // Assigned later

      clearValue: [0.1, 0.4, 0.5, 1.0],
      loadOp: 'clear',
      storeOp: 'store',
    },
  ],
};

const prefixSumDisplayRenderer = new PrefixSumDisplayRenderer({
  device,
  presentationFormat,
  renderPassDescriptor,
  bindGroupLayout: displayBindGroupLayout,
  bindGroup: displayBindGroup,
  label: 'PrefixSum',
});

device.queue.writeBuffer(inputVecBuffer, 0, elements);

const prefixSum = new PrefixSum(
  device,
  linearIndexingAvailable,
  inputVecBuffer,
  outputBuffer,
  elements
);

let autoSortIntervalID: ReturnType<typeof setInterval> | null = null;
const startSortInterval = () => {
  const currentIntervalSpeed = settings['Auto Sort Speed'];
  autoSortIntervalID = setInterval(() => {
    if (settings['Auto Sort Speed'] !== currentIntervalSpeed) {
      clearInterval(autoSortIntervalID);
      autoSortIntervalID = null;
      startSortInterval();
    }
    settings.executeStep = true;
  }, settings['Auto Sort Speed']);
};

// Folder with functions that control the execution of the sort
const controlFolder = gui.addFolder('Sort Controls');
controlFolder
  .add(settings, 'Log Elements')
  .onChange(() => console.log(elements));
controlFolder
  .add(settings, 'Auto Sort Speed', 50, 1000)
  .step(50)
  .name('Auto Step Speed');
controlFolder.open();

// Additional Information about the execution state of the sort
const executionInformationFolder = gui.addFolder('Execution Information');

const prevStepController = executionInformationFolder.add(
  settings,
  'Prev Step'
);
const nextStepController = executionInformationFolder.add(
  settings,
  'Next Step'
);

// Adjust styles of Function List Elements within GUI
const liFunctionElements = document.getElementsByClassName('cr function');
for (let i = 0; i < liFunctionElements.length; i++) {
  (liFunctionElements[i].children[0] as HTMLElement).style.display = 'flex';
  (liFunctionElements[i].children[0] as HTMLElement).style.justifyContent =
    'center';
  (
    liFunctionElements[i].children[0].children[1] as HTMLElement
  ).style.position = 'absolute';
}

startSortInterval();

async function frame() {
  device.queue.writeBuffer(
    displayUniformsBuffer,
    0,
    new Float32Array([settings['Grid Width'], settings['Grid Height']])
  );

  renderPassDescriptor.colorAttachments[0].view = context
    .getCurrentTexture()
    .createView();

  const commandEncoder = device.createCommandEncoder();

  let didPrefixSum = false;
  if (settings.executeStep) {
    if (settings['Next Step'] === 'PREFIX_SUM') {
      prefixSum.run(commandEncoder);
      commandEncoder.copyBufferToBuffer(
        outputBuffer,
        0,
        outputStagingBuffer,
        0,
        elementsBufferSize
      );
      didPrefixSum = true;
    } else {
      elements = new Uint32Array(TOTAL_ELEMENTS).fill(1);
      // Just overwrite outputBuffer
      // inputVecBuffer stays the same throughout execution but the outputBuffer gets
      // the result of the prefix sum of inputVecBuffer
      device.queue.writeBuffer(outputBuffer, 0, elements);
    }

    prevStepController.setValue(settings['Next Step']);
    nextStepController.setValue(
      settings['Next Step'] === 'PREFIX_SUM' ? 'RESET' : 'PREFIX_SUM'
    );
  }

  prefixSumDisplayRenderer.startRun(commandEncoder);
  device.queue.submit([commandEncoder.finish()]);

  // Need to overwite elements for log after prefix sum
  if (didPrefixSum) {
    await outputStagingBuffer.mapAsync(GPUMapMode.READ, 0, elementsBufferSize);
    const copyBuffer = outputStagingBuffer.getMappedRange(
      0,
      elementsBufferSize
    );
    elements = new Uint32Array(copyBuffer.slice(0));
    outputStagingBuffer.unmap();
  }

  settings.executeStep = false;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
