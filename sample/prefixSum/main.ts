import { GUI } from 'dat.gui';
import PrefixSumDisplayRenderer from './prefixSumDisplay';
import {
  quitIfAdapterNotAvailable,
  quitIfLimitLessThan,
  quitIfWebGPUNotAvailableOrMissingFeatures,
} from '../util';

// Type of step that will be executed in our shader
enum StepEnum {
  RESET,
  PREFIX_SUM,
}

type StepType =
  // RESET: Reset data buffer
  | 'RESET'
  // PREFIX SUM: Execute prefix sum
  | 'PREFIX_SUM';

interface ConfigInfo {
  // Number of sorts executed under a given elements + size limit config
  numPrefixSums: number;
  // Total collective time taken to execute each complete sort under this config
  averageTime: number;
}

// Gui settings object
interface SettingsInterface extends ConfigInfo {
  'Total Elements': number;
  'Grid Width': number;
  'Grid Height': number;
  'Grid Dimensions': string;
  'Workgroup Size': number;
  'Workgroups Per Step': number;
  'Prev Step': StepType;
  'Next Step': StepType;
  executeStep: boolean;
  'Execute Sort Step': () => void;
  'Log Elements': () => void;
  'Auto Sort': () => void;
  'Auto Sort Speed': number;
  'Step Time': string;
  sortTime: number;
  'Sort Time': string;
  'Average Sort Time': string;
}

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const gui = new GUI();

const adapter = await navigator.gpu?.requestAdapter({
  featureLevel: 'compatibility',
});
quitIfAdapterNotAvailable(adapter);

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

let querySet: GPUQuerySet;
let timestampQueryResolveBuffer: GPUBuffer;
let timestampQueryResultBuffer: GPUBuffer;
if (timestampQueryAvailable) {
  querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
  timestampQueryResolveBuffer = device.createBuffer({
    // 2 timestamps * BigInt size for nanoseconds
    size: 2 * BigInt64Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
  });
  timestampQueryResultBuffer = device.createBuffer({
    // 2 timestamps * BigInt size for nanoseconds
    size: 2 * BigInt64Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
}

const totalElementOptions = [];
const maxElements = maxInvocationsX * 32;
for (let i = maxElements; i >= 4; i /= 2) {
  totalElementOptions.push(i);
}

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
  // A function that randomizes the values of each element.
  // When called, all relevant values within the settings object are reset to their defaults at the beginning of a sort with n elements.
  // A function that manually executes a single step of the bitonic sort.
  'Execute Sort Step': () => {
    return;
  },
  // A function that logs the values of each element as an array to the browser's console.
  'Log Elements': () => {
    return;
  },
  // A function that automatically executes each step of the bitonic sort at an interval determined by 'Auto Sort Speed'
  'Auto Sort': () => {
    return;
  },
  // The speed at which each step of the bitonic sort will be executed after 'Auto Sort' has been called.
  'Auto Sort Speed': 50,

  // TIMESTAMP SETTINGS
  // Total taken to colletively execute each step of the complete bitonic sort, represented in milliseconds.
  'Sort Time': '0ms',
  sortTime: 0,
  // Average time taken to complete a bitonic sort with the current combination of n 'Total Elements' and x 'Size Limit'
  'Average Sort Time': '0ms',
  numPrefixSums: 0,
  averageTime: 0,
};

// Initialize initial elements array
let elements = new Uint32Array(
  Array.from({ length: settings['Total Elements'] }, (_, i) => i)
);

// Initialize elementsBuffer and elementsStagingBuffer
const elementsBufferSize =
  Float32Array.BYTES_PER_ELEMENT * totalElementOptions[0];
// Initialize input, output, staging buffers
const elementsInputBuffer = device.createBuffer({
  size: elementsBufferSize,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
const elementsOutputBuffer = device.createBuffer({
  size: elementsBufferSize,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
});
const elementsStagingBuffer = device.createBuffer({
  size: elementsBufferSize,
  usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});

const displayUniformsBuffer = device.createBuffer({
  size: Float16Array.BYTES_PER_ELEMENT * 2,
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
      resource: elementsInputBuffer,
    },
    {
      binding: 1,
      resource: displayUniformsBuffer,
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

const resetExecutionInformation = () => {
  // The workgroup size is either elements / 2 or Size Limit
  workgroupSizeController.setValue(
    Math.min(settings['Total Elements'] / 2, settings['Size Limit'])
  );

  // Dispatch a workgroup for every (Size Limit * 2) elements
  const workgroupsPerStep =
    (settings['Total Elements'] - 1) / (settings['Size Limit'] * 2);

  workgroupsPerStepController.setValue(Math.ceil(workgroupsPerStep));

  // Get new width and height of screen display in cells
  const newCellWidth =
    Math.sqrt(settings['Total Elements']) % 2 === 0
      ? Math.floor(Math.sqrt(settings['Total Elements']))
      : Math.floor(Math.sqrt(settings['Total Elements'] / 2));
  const newCellHeight = settings['Total Elements'] / newCellWidth;
  settings['Grid Width'] = newCellWidth;
  settings['Grid Height'] = newCellHeight;
  gridDimensionsController.setValue(`${newCellWidth}x${newCellHeight}`);

  // Set prevStep to None (restart) and next step to FLIP
  prevStepController.setValue('RESET');
  nextStepController.setValue('PREFIX_SUM');
};

const resizeElementArray = () => {
  // Recreate elements array with new length
  elements = new Uint32Array(
    Array.from({ length: settings['Total Elements'] }, (_, i) => i)
  );

  resetExecutionInformation();
};

let autoSortIntervalID: ReturnType<typeof setInterval> | null = null;
const endSortInterval = () => {
  if (autoSortIntervalID !== null) {
    clearInterval(autoSortIntervalID);
    autoSortIntervalID = null;
  }
};
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

// At top level, information about resources used to execute the compute shader
// i.e elements sorted, invocations per workgroup, and workgroups dispatched
const computeResourcesFolder = gui.addFolder('Compute Resources');
computeResourcesFolder
  .add(settings, 'Total Elements', totalElementOptions)
  .onChange(() => {
    endSortInterval();
    resizeElementArray();
    // Create new config key for current element + size limit configuration
    // const currConfigKey = `${settings['Total Elements']} ${settings['Size Limit']}`;
    // If configKey doesn't exist in the map, create it.
    /* if (!settings.configToCompleteSwapsMap[currConfigKey]) {
          settings.configToCompleteSwapsMap[currConfigKey] = {
            sorts: 0,
            time: 0,
          };
        } */
    // settings.configKey = currConfigKey;
    //resetTimeInfo();
  });
const workgroupSizeController = computeResourcesFolder.add(
  settings,
  'Workgroup Size'
);
const workgroupsPerStepController = computeResourcesFolder.add(
  settings,
  'Workgroups Per Step'
);

computeResourcesFolder.open();

// Folder with functions that control the execution of the sort
const controlFolder = gui.addFolder('Sort Controls');
controlFolder.add(settings, 'Execute Sort Step').onChange(() => {
  // Size Limit locked upon sort
  endSortInterval();
  settings.executeStep = true;
});
controlFolder
  .add(settings, 'Log Elements')
  .onChange(() => console.log(elements));
controlFolder.add(settings, 'Auto Sort').onChange(() => {
  // Invocation Limit locked upon sort
  startSortInterval();
});
controlFolder.add(settings, 'Auto Sort Speed', 50, 1000).step(50);
controlFolder.open();

// Information about grid display
const gridFolder = gui.addFolder('Grid Information');
const gridDimensionsController = gridFolder.add(settings, 'Grid Dimensions');

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
// Timestamp information
const timestampFolder = gui.addFolder('Timestamp Info');
const stepTimeController = timestampFolder.add(settings, 'Step Time');
const sortTimeController = timestampFolder.add(settings, 'Sort Time');
const averageSortTimeController = timestampFolder.add(
  settings,
  'Average Sort Time'
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

// Mouse listener that determines values of hoveredCell and swappedCell
canvas.addEventListener('mousemove', (event) => {
  const currWidth = canvas.getBoundingClientRect().width;
  const currHeight = canvas.getBoundingClientRect().height;
  const cellSize: [number, number] = [
    currWidth / settings['Grid Width'],
    currHeight / settings['Grid Height'],
  ];
  const xIndex = Math.floor(event.offsetX / cellSize[0]);
  const yIndex =
    settings['Grid Height'] - 1 - Math.floor(event.offsetY / cellSize[1]);
  settings['Hovered Cell'] = yIndex * settings['Grid Width'] + xIndex;
});

// Deactivate interaction with select GUI elements
workgroupsPerStepController.domElement.style.pointerEvents = 'none';
workgroupSizeController.domElement.style.pointerEvents = 'none';
gridDimensionsController.domElement.style.pointerEvents = 'none';
stepTimeController.domElement.style.pointerEvents = 'none';
sortTimeController.domElement.style.pointerEvents = 'none';
averageSortTimeController.domElement.style.pointerEvents = 'none';
gui.width = 325;

startSortInterval();

async function frame() {
  // Write elements buffer
  device.queue.writeBuffer(
    elementsInputBuffer,
    0,
    elements.buffer,
    elements.byteOffset,
    elements.byteLength
  );

  const dims = new Float32Array([
    settings['Grid Width'],
    settings['Grid Height'],
  ]);
  const stepDetails = new Uint32Array([
    StepEnum[settings['Next Step']],
    settings['Next Swap Span'],
  ]);
  device.queue.writeBuffer(
    computeUniformsBuffer,
    0,
    dims.buffer,
    dims.byteOffset,
    dims.byteLength
  );

  device.queue.writeBuffer(computeUniformsBuffer, 8, stepDetails);

  renderPassDescriptor.colorAttachments[0].view = context
    .getCurrentTexture()
    .createView();

  const commandEncoder = device.createCommandEncoder();
  prefixSumDisplayRenderer.startRun(commandEncoder);
  if (settings.executeStep) {
    let computePassEncoder: GPUComputePassEncoder;
    if (timestampQueryAvailable) {
      computePassEncoder = commandEncoder.beginComputePass({
        timestampWrites: {
          querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        },
      });
    } else {
      computePassEncoder = commandEncoder.beginComputePass();
    }
    computePassEncoder.setPipeline(computePipeline);
    computePassEncoder.setBindGroup(0, computeBGCluster.bindGroups[0]);
    computePassEncoder.dispatchWorkgroups(settings['Workgroups Per Step']);
    computePassEncoder.end();
    // Resolve time passed in between beginning and end of computePass
    if (timestampQueryAvailable) {
      commandEncoder.resolveQuerySet(
        querySet,
        0,
        2,
        timestampQueryResolveBuffer,
        0
      );
      commandEncoder.copyBufferToBuffer(
        timestampQueryResolveBuffer,
        timestampQueryResultBuffer
      );
    }

    prevStepController.setValue(settings['Next Step']);
    nextStepController.setValue(
      settings['Next Step'] === 'PREFIX_SUM' ? 'RESET' : 'PREFIX_SUM'
    );

    // Copy GPU accessible buffers to CPU accessible buffers
    commandEncoder.copyBufferToBuffer(
      elementsOutputBuffer,
      elementsStagingBuffer
    );
  }
  device.queue.submit([commandEncoder.finish()]);

  if (settings.executeStep) {
    // Copy GPU element data to CPU
    await elementsStagingBuffer.mapAsync(
      GPUMapMode.READ,
      0,
      elementsBufferSize
    );
    const copyElementsBuffer = elementsStagingBuffer.getMappedRange(
      0,
      elementsBufferSize
    );

    const elementsData = copyElementsBuffer.slice(
      0,
      Uint32Array.BYTES_PER_ELEMENT * settings['Total Elements']
    );
    // Extract data
    const elementsOutput = new Uint32Array(elementsData);
    elementsStagingBuffer.unmap();
    // Elements output becomes elements input, swap accumulate
    elements = elementsOutput;

    // Handle timestamp query stuff
    if (timestampQueryAvailable) {
      // Copy timestamp query result buffer data to CPU
      await timestampQueryResultBuffer.mapAsync(
        GPUMapMode.READ,
        0,
        2 * BigInt64Array.BYTES_PER_ELEMENT
      );
      const copyTimestampResult = new BigInt64Array(
        timestampQueryResultBuffer.getMappedRange()
      );
      // Calculate new step, sort, and average sort times
      const newStepTime =
        Number(copyTimestampResult[1] - copyTimestampResult[0]) / 1000000;
      // We accumulate here but it should be a new step
      const newSortTime = settings.sortTime + newStepTime;
      // Apply calculated times to settings object as both number and 'ms' appended string
      settings.sortTime = newSortTime;
      sortTimeController.setValue(`${newSortTime.toFixed(5)}ms`);
      // Calculate new average sort upon end of final execution step of a full bitonic sort.
      /* settings.configToCompleteSwapsMap[settings.configKey].time +=
              newSortTime;
            const averageSortTime =
              settings.configToCompleteSwapsMap[settings.configKey].time /
              settings.configToCompleteSwapsMap[settings.configKey].sorts;
            averageSortTimeController.setValue(
              `${averageSortTime.toFixed(5)}ms`
            );
          } */
      timestampQueryResultBuffer.unmap();
      // Get correct range of data from CPU copy of GPU Data
    }
  }
  settings.executeStep = false;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
