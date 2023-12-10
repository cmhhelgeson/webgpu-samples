import { makeSample, SampleInit } from '../../components/SampleLayout';
import { create3DRenderPipeline } from '../normalMap/utils';
import { createBindGroupCluster, extractGPUData } from './utils';
import particleWGSL from './render/particle.wgsl';
import positionsWGSL from './fluidCompute/positions.wgsl';
import densityWGSL from './fluidCompute/density.wgsl';
import {
  createSpatialSortResource,
  StepEnum,
  StepType,
} from './sortCompute/sort';
import sortWGSL from './sortCompute/sort.wgsl';
import offsetsWGSL from './sortCompute/offsets.wgsl';
import commonWGSL from './common.wgsl';
import spatialHashWGSL from './fluidCompute/spatialHash.wgsl';
import ParticleRenderer from './render/renderParticle';

interface ComputeSpatialInformationArgs {
  device: GPUDevice;
  commandEncoder: GPUCommandEncoder;
  initialValues?: Uint32Array;
}

const init: SampleInit = async ({ pageState, gui, canvas, stats }) => {
  // Get device specific resources and constants
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  if (!pageState.active) return;
  const context = canvas.getContext('webgpu') as GPUCanvasContext;
  const devicePixelRatio = window.devicePixelRatio;
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  const aspect = canvas.width / canvas.height;
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });
  const maxWorkgroupSizeX = device.limits.maxComputeWorkgroupSizeX;

  const settings = {
    // The gravity force applied to each particle
    Gravity: -9.8,
    'Delta Time': 0.04,
    // The total number of particles being simulated
    'Total Particles': 512,
    // A fluid particle's display radius
    'Particle Radius': 10.0,
    // The radius of influence from the center of a particle to
    'Smoothing Radius': 0.7,
    // The bounce dampening on a non-fluid particle
    Damping: 0.7,
    // A boolean indicating whether the simulation is in the process of resetting
    isResetting: false,
    simulate: false,
  };

  /* COMPUTE SHADER RESOURCE PREPARATION */

  // Create buffer for default positions data
  const inputPositionsData = new Float32Array(
    new ArrayBuffer(
      settings['Total Particles'] * 2 * Float32Array.BYTES_PER_ELEMENT
    )
  );

  // Create buffer for default velocities data
  const inputVelocitiesData = new Float32Array(
    new ArrayBuffer(
      settings['Total Particles'] * 2 * Float32Array.BYTES_PER_ELEMENT
    )
  );

  // Generate positions data and velocities data for their respective buffers
  const generateParticles = () => {
    for (let i = 0; i < settings['Total Particles']; i++) {
      // Position
      inputPositionsData[i * 2 + 0] =
        -canvas.width + Math.random() * (canvas.width * 2);
      inputPositionsData[i * 2 + 1] =
        -canvas.height + Math.random() * (canvas.height * 2);

      // Velocity
      inputVelocitiesData[i * 2 + 0] = 0;
      inputVelocitiesData[i * 2 + 1] = 0;
    }
  };

  /* PARTICLE RENDER SHADER */

  // These buffers will be used across our compute shaders, but need to be defined for the renderer as well
  const particlePositionsBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * settings['Total Particles'] * 2,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const particleVelocitiesBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * settings['Total Particles'] * 2,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: undefined, // Assigned later
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  const particleRenderer = new ParticleRenderer({
    device,
    numParticles: settings['Total Particles'],
    positionsBuffer: particlePositionsBuffer,
    velocitiesBuffer: particleVelocitiesBuffer,
    presentationFormat,
    _renderPassDescriptor: renderPassDescriptor,
  });

  /* Various Shared Compute Shader Resources */
  const predictedPositionsBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * settings['Total Particles'] * 2,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const densitiesBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * settings['Total Particles'] * 2,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // General uniforms including the number of particles, deltaTime, etc
  const generalUniformsBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Simulation specific uniforms
  const particlePropertiesUniformsBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });

  /* POSITIONS COMPUTE SHADER */

  // Same as particleStorageBGCluster but resources are read_write
  const particleMovementStorageBGCluster = createBindGroupCluster({
    device: device,
    label: 'ComputePositions.storageBGCluster',
    bindings: [0, 1, 2, 3],
    visibilities: [GPUShaderStage.COMPUTE],
    resourceTypes: ['buffer', 'buffer', 'buffer', 'buffer'],
    resourceLayouts: [
      { type: 'storage' },
      { type: 'storage' },
      { type: 'storage' },
      { type: 'storage' },
    ],
    resources: [
      [
        { buffer: particlePositionsBuffer },
        { buffer: particleVelocitiesBuffer },
        { buffer: predictedPositionsBuffer },
        { buffer: densitiesBuffer },
      ],
    ],
  });

  const particlePropertiesUniformsBGCluster = createBindGroupCluster({
    device: device,
    label: 'ComputePositions.uniformsBGCluster',
    bindings: [0, 1],
    visibilities: [GPUShaderStage.COMPUTE],
    resourceTypes: ['buffer', 'buffer'],
    resourceLayouts: [{ type: 'uniform' }, { type: 'uniform' }],
    resources: [
      [
        { buffer: generalUniformsBuffer },
        { buffer: particlePropertiesUniformsBuffer },
      ],
    ],
  });

  const positionsComputePipeline = device.createComputePipeline({
    label: 'ComputePositions.computePipeline',
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        particleMovementStorageBGCluster.bindGroupLayout,
        particlePropertiesUniformsBGCluster.bindGroupLayout,
      ],
    }),
    compute: {
      module: device.createShaderModule({
        label: 'ComputePositions.computeShader',
        code: positionsWGSL + commonWGSL,
      }),
      entryPoint: 'computeMain',
    },
  });

  /* GPU SORT PIPELINE */
  // Create buffers, workgroup and invocation numbers
  const sortResource = createSpatialSortResource({
    device,
    numParticles: settings['Total Particles'],
    createStagingBuffers: false,
  });

  // Create spatialIndices sort pipelines
  const sortSpatialIndicesPipeline = device.createComputePipeline({
    label: 'SpatialInfoSort.sortSpatialIndices.computePipeline',
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        sortResource.dataStorageBGCluster.bindGroupLayout,
        sortResource.algoStorageBGCluster.bindGroupLayout,
      ],
    }),
    compute: {
      entryPoint: 'computeMain',
      module: device.createShaderModule({
        code: sortWGSL,
      }),
    },
  });

  // Create spatialOffsets assignment pipeline
  const computeSpatialOffsetsPipeline = device.createComputePipeline({
    label: 'SpatialInfoSort.computeSpatialOffsets.computePipeline',
    layout: device.createPipelineLayout({
      bindGroupLayouts: [sortResource.dataStorageBGCluster.bindGroupLayout],
    }),
    compute: {
      entryPoint: 'computeMain',
      module: device.createShaderModule({
        code: offsetsWGSL,
      }),
    },
  });

  // Process that actually executes the sort and the pipeline
  // Either the provide the buffer with initial values, or write to it from a previous shader
  const computeSpatialInformation = (args: ComputeSpatialInformationArgs) => {
    const { device, commandEncoder, initialValues } = args;
    // If we provide initial values to the sort
    if (initialValues) {
      // Check if the size of the initialValues array matches our buffer
      if (initialValues.byteLength !== sortResource.spatialIndicesBufferSize) {
        console.log(
          'Incorrect arrayBuffer size. Size of spatialIndices array must be equal to Uint32Array.BytesPerElement * 3 * totalParticles'
        );
      }
      // Write initial values to buffer before sort
      device.queue.writeBuffer(
        sortResource.spatialIndicesBuffer,
        0,
        initialValues.buffer,
        initialValues.byteOffset,
        initialValues.byteLength
      );
    }

    // Set up the defaults at the beginning of an arbitrarily sized bitonic sort
    // First operation is always a flip operation with a swap span of two (ie 0 -> 1 2 -> 3, etc)
    let nextBlockHeight = 2;
    // String that allows us to access values in StepEnum, which are then passed to our sort shader
    let nextAlgo: StepType = 'FLIP_LOCAL';
    // Highest Block Height is the highest swap span we've yet encountered during the sort
    let highestBlockHeight = nextBlockHeight;

    if (initialValues) {
      const initialAlgoInfo = new Uint32Array([
        StepEnum[nextAlgo], // starts at 1
        nextBlockHeight, // starts at 2
        highestBlockHeight, // starts at 2
        sortResource.workgroupsToDispatch, // particles / maxWorkgroupSize
      ]);
      // Write defaults algoInfo to buffer
      device.queue.writeBuffer(
        sortResource.algoStorageBuffer,
        0,
        initialAlgoInfo.buffer,
        initialAlgoInfo.byteOffset,
        initialAlgoInfo.byteLength
      );
    }

    // We calculate the numSteps for a single complete pass of the bitonic sort because it allows the user to better debug where in the shader (i.e in which step)
    // something is going wrong
    for (let i = 0; i < sortResource.stepsInSort; i++) {
      const sortSpatialIndicesComputePassEncoder =
        commandEncoder.beginComputePass();
      // Set the resources for this pass of the compute shader
      sortSpatialIndicesComputePassEncoder.setPipeline(
        sortSpatialIndicesPipeline
      );
      sortSpatialIndicesComputePassEncoder.setBindGroup(
        0,
        sortResource.dataStorageBGCluster.bindGroups[0]
      );
      sortSpatialIndicesComputePassEncoder.setBindGroup(
        1,
        sortResource.algoStorageBGCluster.bindGroups[0]
      );
      // Dispatch workgroups
      sortSpatialIndicesComputePassEncoder.dispatchWorkgroups(
        sortResource.workgroupsToDispatch
      );
      sortSpatialIndicesComputePassEncoder.end();
      nextBlockHeight /= 2;
      if (nextBlockHeight === 1) {
        highestBlockHeight *= 2;
        if (highestBlockHeight === settings['Total Particles'] * 2) {
          nextAlgo = 'NONE';
        } else if (highestBlockHeight > sortResource.maxWorkgroupSize * 2) {
          nextAlgo = 'FLIP_GLOBAL';
          nextBlockHeight = highestBlockHeight;
        } else {
          nextAlgo = 'FLIP_LOCAL';
          nextBlockHeight = highestBlockHeight;
        }
      } else {
        nextBlockHeight > sortResource.maxWorkgroupSize * 2
          ? (nextAlgo = 'DISPERSE_GLOBAL')
          : (nextAlgo = 'DISPERSE_LOCAL');
      }
      if (sortResource.spatialIndicesStagingBuffer) {
        // Copy the result of the sort to the staging buffer
        commandEncoder.copyBufferToBuffer(
          sortResource.spatialIndicesBuffer,
          0,
          sortResource.spatialIndicesStagingBuffer,
          0,
          sortResource.spatialIndicesBufferSize
        );
      }
    }
    const computeSpatialOffsetPassEncoder = commandEncoder.beginComputePass();
    computeSpatialOffsetPassEncoder.setPipeline(computeSpatialOffsetsPipeline);
    computeSpatialOffsetPassEncoder.setBindGroup(
      0,
      sortResource.dataStorageBGCluster.bindGroups[0]
    );
    computeSpatialOffsetPassEncoder.dispatchWorkgroups(
      sortResource.workgroupsToDispatch
    );
    computeSpatialOffsetPassEncoder.end();
    if (sortResource.spatialOffsetsStagingBuffer) {
      commandEncoder.copyBufferToBuffer(
        sortResource.spatialOffsetsBuffer,
        0,
        sortResource.spatialOffsetsStagingBuffer,
        0,
        Uint32Array.BYTES_PER_ELEMENT * settings['Total Particles']
      );
    }
  };

  /* SPATIAL HASH PIPELINE */
  const spatialHashPipeline = device.createComputePipeline({
    label: 'ComputeSpatialHash.pipeline',
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        sortResource.dataStorageBGCluster.bindGroupLayout,
        particleMovementStorageBGCluster.bindGroupLayout,
        particlePropertiesUniformsBGCluster.bindGroupLayout,
      ],
    }),
    compute: {
      // TODO: Remove after Chrome 121
      entryPoint: 'computeMain',
      module: device.createShaderModule({
        code: spatialHashWGSL + commonWGSL,
      }),
    },
  });

  // DEBUG CODE FOR INDICES SORT AND OFFSETS CREATION
  /*const randomIndices = new Uint32Array(
    Array.from({ length: settings['Total Particles'] * 3 }, (_, i) => {
      if ((i + 1) % 3 === 0) {
        return Math.floor(Math.random() * 100);
      } else {
        return 0;
      }
    })
  );
  console.log(randomIndices);
  const commandEncoder = device.createCommandEncoder();
  computeSpatialInformation({
    device,
    commandEncoder,
    initialValues: randomIndices,
  });
  device.queue.submit([commandEncoder.finish()]);
  extractGPUData(
    sortResource.spatialIndicesStagingBuffer,
    sortResource.spatialIndicesBufferSize
  ).then((res) => {
    const data = new Uint32Array(res);
    const keys = [];
    for (let i = 2; i < data.length; i += 3) {
      keys.push(data[i]);
    }
    console.log(keys);
  });
  extractGPUData(
    sortResource.spatialOffsetsStagingBuffer,
    sortResource.spatialOffsetsBufferSize
  ).then((res) => console.log(new Uint32Array(res))); */

  // Test sort on a randomly created set of values (program should only sort according to key element);

  generateParticles();

  gui.add(settings, 'simulate');
  gui.add(settings, 'Delta Time', 0.01, 0.5).step(0.01);
  gui.add(settings, 'Particle Radius', 0.0, 300.0).step(1.0);
  gui.add(settings, 'Gravity', -20.0, 20.0).step(0.1);
  gui.add(settings, 'Damping', 0.0, 1.0).step(0.1);

  // Initial write to main storage buffers
  device.queue.writeBuffer(particlePositionsBuffer, 0, inputPositionsData);
  device.queue.writeBuffer(particleVelocitiesBuffer, 0, inputVelocitiesData);
  device.queue.writeBuffer(predictedPositionsBuffer, 0, inputPositionsData);

  // Create initial algorithmic info that begins our per frame bitonic sort
  const initialAlgoInfo = new Uint32Array([
    1, // starts at 1
    2, // starts at 2
    2, // starts at 2
    sortResource.workgroupsToDispatch, // particles / maxWorkgroupSize
  ]);

  async function frame() {
    if (!pageState.active) return;

    stats.begin();

    // Write to uniforms buffers
    device.queue.writeBuffer(
      generalUniformsBuffer,
      0,
      new Uint32Array([settings['Total Particles']])
    );

    device.queue.writeBuffer(
      generalUniformsBuffer,
      4,
      new Float32Array([
        settings['Delta Time'],
        canvas.width - settings['Particle Radius'],
        canvas.height - settings['Particle Radius'],
      ])
    );

    device.queue.writeBuffer(
      particlePropertiesUniformsBuffer,
      0,
      new Float32Array([
        settings.Damping,
        settings.Gravity,
        settings['Smoothing Radius'],
      ])
    );

    particleRenderer.writeUniforms(device, {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      particleRadius: settings['Particle Radius']
    });

    // Write initial algorithm information to algo buffer within our sort object
    device.queue.writeBuffer(
      sortResource.algoStorageBuffer,
      0,
      initialAlgoInfo.buffer,
      initialAlgoInfo.byteOffset,
      initialAlgoInfo.byteLength
    );

    renderPassDescriptor.colorAttachments[0].view = context
      .getCurrentTexture()
      .createView();

    const commandEncoder = device.createCommandEncoder();

    if (settings.simulate) {
      // Compute Spatial Hash (index, hash, key)
      const computeSpatialHashEncoder = commandEncoder.beginComputePass();
      computeSpatialHashEncoder.setPipeline(spatialHashPipeline);
      computeSpatialHashEncoder.setBindGroup(
        0,
        sortResource.dataStorageBGCluster.bindGroups[0]
      );
      computeSpatialHashEncoder.setBindGroup(
        1,
        particleMovementStorageBGCluster.bindGroups[0]
      );
      computeSpatialHashEncoder.setBindGroup(
        2,
        particlePropertiesUniformsBGCluster.bindGroups[0]
      );
      computeSpatialHashEncoder.dispatchWorkgroups(
        Math.ceil(settings['Total Particles'] / maxWorkgroupSizeX)
      );
      computeSpatialHashEncoder.end();

      // Sort Spatial Indices (index, hash, key) and compute offsets
      computeSpatialInformation({
        device,
        commandEncoder,
      });

      // Run compute shader to compute particle positions
      const computePositionsPassEncoder = commandEncoder.beginComputePass();
      computePositionsPassEncoder.setPipeline(positionsComputePipeline);
      computePositionsPassEncoder.setBindGroup(
        0,
        particleMovementStorageBGCluster.bindGroups[0]
      );
      computePositionsPassEncoder.setBindGroup(
        1,
        particlePropertiesUniformsBGCluster.bindGroups[0]
      );
      computePositionsPassEncoder.dispatchWorkgroups(
        Math.ceil(settings['Total Particles'] / maxWorkgroupSizeX)
      );
      computePositionsPassEncoder.end();
    }

    particleRenderer.render(commandEncoder);

    device.queue.submit([commandEncoder.finish()]);
    stats.end();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};

const fluidExample: () => JSX.Element = () =>
  makeSample({
    name: 'Fluid Example',
    description: 'WIP Fluid Sim',
    init,
    gui: true,
    stats: true,
    sources: [
      // Main files
      {
        name: __filename.substring(__dirname.length + 1),
        contents: __SOURCE__,
      },
      // Render files
      {
        name: './particle.wgsl',
        contents: particleWGSL,
      },
      {
        name: './fluidCompute/positions.wgsl',
        contents: positionsWGSL,
      },
      {
        name: './fluidCompute/spatialHash.wgsl',
        contents: spatialHashWGSL,
      },
      {
        name: './density.wgsl',
        contents: densityWGSL,
      },
    ],
    filename: __filename,
  });

export default fluidExample;
