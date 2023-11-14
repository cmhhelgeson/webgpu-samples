import { mat4, vec3 } from 'wgpu-matrix';
import { makeSample, SampleInit } from '../../components/SampleLayout';
import { createMeshRenderable } from '../../meshes/mesh';
import heightsFromTextureWGSL from './heightsFromTexture.wgsl';
import { create3DRenderPipeline, createBindGroupCluster } from './utils';
import { createTerrainMesh, TerrainDescriptor } from '../../meshes/terrain';
import terrainWGSL from './terrain.wgsl';
import { WASDCamera } from '../cameras/camera';
import { createInputHandler } from '../cameras/input';
import { createFaultFormation } from './terrain';

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

  const settings = {
    cameraPosX: 67,
    cameraPosY: 370,
    cameraPosZ: 429,
    lightPosX: 1.7,
    lightPosY: 0.7,
    lightPosZ: -1.9,
    lightIntensity: 0.02,
    'Height Scale': 2.4,
    'World Scale': 8.0,
    'Fault Iterations': 50,
    'Fault Min Height': 0,
    'Fault Max Height': 50,
    'Erosion Filter': 0.4,
    'Topology Mode': 'line-list',
    'Log Camera': () => {
      console.log(camera.position);
      console.log(camera.yaw);
      console.log(camera.pitch);
    },
  };

  // Create camera
  const inputHandler = createInputHandler(window);
  const camera = new WASDCamera({
    position: vec3.create(
      settings.cameraPosX,
      settings.cameraPosY,
      settings.cameraPosZ
    ),
    target: vec3.create(0, 0, 0),
  });

  camera.yaw = -2.24;
  camera.pitch = 0.07079;

  // Create terrain
  let heights: Float32Array;
  {
    const response = await fetch('../assets/heightmap.save');
    const buffer = await response.arrayBuffer();
    const floatArray = new Float32Array(buffer);
    heights = floatArray;
  }

  // Create terrainSize and heightOffsets array from original heights
  // (Size of terrain assumed to be square for now)
  const terrainSize = Math.sqrt(heights.length);
  const heightOffsets = new Float32Array(heights.length);
  const heightOffsetsBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * heights.length,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  // Create default terrain from heightmap
  const terrainDescriptor: TerrainDescriptor = new TerrainDescriptor({
    width: terrainSize,
    depth: terrainSize,
  });
  const terrainMesh = createTerrainMesh(terrainDescriptor, heights);
  // Create terrain fault formations
  const terrainRenderable = createMeshRenderable(
    device,
    terrainMesh,
    false,
    false
  );

  console.log(terrainDescriptor.width);
  createFaultFormation({
    heightOffsets,
    terrainSize: terrainDescriptor.width,
    iterations: settings['Fault Iterations'],
    minHeight: settings['Fault Min Height'],
    maxHeight: settings['Fault Max Height'],
  });

  device.queue.writeBuffer(
    heightOffsetsBuffer,
    0,
    heightOffsets.buffer,
    heightOffsets.byteOffset,
    heightOffsets.byteLength
  );

  const spaceUniformsBuffer = device.createBuffer({
    // mat4x4f
    size: 64 * 2,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const lightUniformsBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * 6,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Uniform bindGroups and bindGroupLayout
  const frameBGDescriptor = createBindGroupCluster(
    [0, 1],
    [
      GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
    ],
    ['buffer', 'buffer'],
    [{ type: 'uniform' }, { type: 'uniform' }],
    [[{ buffer: spaceUniformsBuffer }, { buffer: lightUniformsBuffer }]],
    'Frame',
    device
  );

  const storageBGDescriptor = createBindGroupCluster(
    [0],
    [GPUShaderStage.VERTEX],
    ['buffer'],
    [{ type: 'read-only-storage' }],
    [[{ buffer: heightOffsetsBuffer }]],
    'Storage',
    device
  );

  const terrainLineListPipeline = create3DRenderPipeline(
    device,
    'TerrainRenderer.LineList',
    [frameBGDescriptor.bindGroupLayout, storageBGDescriptor.bindGroupLayout],
    terrainWGSL,
    terrainMesh.vertexLayout,
    terrainWGSL,
    presentationFormat,
    true,
    'line-list',
    'back',
    'ccw'
  );

  const terainTriangleListPipeline = create3DRenderPipeline(
    device,
    'TerrainRenderer.TriangleList',
    [frameBGDescriptor.bindGroupLayout, storageBGDescriptor.bindGroupLayout],
    terrainWGSL,
    terrainMesh.vertexLayout,
    terrainWGSL,
    presentationFormat,
    true,
    'triangle-list',
    'back',
    'ccw'
  );

  // Create Render Pass Descriptor
  const depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
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
    depthStencilAttachment: {
      view: depthTexture.createView(),

      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  };

  const aspect = canvas.width / canvas.height;
  const projectionMatrix = mat4.perspective(
    (2 * Math.PI) / 5,
    aspect,
    0.1,
    1000.0
  ) as Float32Array;

  const getViewMatrix = (deltaTime: number) => {
    return camera.update(deltaTime * 10, inputHandler()) as Float32Array;
  };

  let currentPipeline = terrainLineListPipeline;

  const webgpuFolder = gui.addFolder('WebGPU Settings');
  webgpuFolder
    .add(settings, 'Topology Mode', ['line-list', 'triangle-list'])
    .onChange(() => {
      switch (settings['Topology Mode']) {
        case 'line-list':
          {
            currentPipeline = terrainLineListPipeline;
          }
          break;
        case 'triangle-list': {
          currentPipeline = terainTriangleListPipeline;
        }
      }
    });

  const terrainFolder = gui.addFolder('Terrain Scale');
  terrainFolder.add(settings, 'Height Scale', 0.0, 3.0).step(0.1);
  terrainFolder.add(settings, 'World Scale', 1.0, 10.0).step(0.1);

  const faultFormationFolder = gui.addFolder('Fault Formation');
  faultFormationFolder
    .add(settings, 'Fault Iterations', 0, 200, 1)
    .onChange(() => {
      createFaultFormation({
        heightOffsets,
        terrainSize: terrainDescriptor.width,
        iterations: settings['Fault Iterations'],
        minHeight: settings['Fault Min Height'],
        maxHeight: settings['Fault Max Height'],
      });
      device.queue.writeBuffer(
        heightOffsetsBuffer,
        0,
        heightOffsets.buffer,
        heightOffsets.byteOffset,
        heightOffsets.byteLength
      );
    });
  faultFormationFolder
    .add(settings, 'Fault Min Height', 0, 100, 1)
    .onChange(() => {
      if (settings['Fault Min Height'] > settings['Fault Max Height']) {
        settings['Fault Min Height'] = settings['Fault Max Height'];
      }
      createFaultFormation({
        heightOffsets,
        terrainSize: terrainDescriptor.width,
        iterations: settings['Fault Iterations'],
        minHeight: settings['Fault Min Height'],
        maxHeight: settings['Fault Max Height'],
      });
      device.queue.writeBuffer(
        heightOffsetsBuffer,
        0,
        heightOffsets.buffer,
        heightOffsets.byteOffset,
        heightOffsets.byteLength
      );
    });
  faultFormationFolder
    .add(settings, 'Fault Max Height', 0, 100, 1)
    .onChange(() => {
      if (settings['Fault Max Height'] < settings['Fault Min Height']) {
        settings['Fault Max Height'] = settings['Fault Min Height'];
      }
      createFaultFormation({
        heightOffsets,
        terrainSize: terrainDescriptor.width,
        iterations: settings['Fault Iterations'],
        minHeight: settings['Fault Min Height'],
        maxHeight: settings['Fault Max Height'],
      });
      device.queue.writeBuffer(
        heightOffsetsBuffer,
        0,
        heightOffsets.buffer,
        heightOffsets.byteOffset,
        heightOffsets.byteLength
      );
    });
  faultFormationFolder.add(settings, 'Erosion Filter', 0.01, 0.5).step(0.01);

  let lastFrameMS = 0;
  function frame() {
    if (!pageState.active) return;
    const now = Date.now();
    const deltaTime = (now - lastFrameMS) / 1000;
    lastFrameMS = now;

    // Write to terrain shader
    const viewMatrix = getViewMatrix(deltaTime);

    device.queue.writeBuffer(
      spaceUniformsBuffer,
      0,
      projectionMatrix.buffer,
      projectionMatrix.byteOffset,
      projectionMatrix.byteLength
    );

    device.queue.writeBuffer(
      spaceUniformsBuffer,
      64,
      viewMatrix.buffer,
      viewMatrix.byteOffset,
      viewMatrix.byteLength
    );

    device.queue.writeBuffer(
      lightUniformsBuffer,
      0,
      new Float32Array([
        settings.lightPosX,
        settings.lightPosY,
        settings.lightPosZ,
        settings.lightIntensity,
        settings['Height Scale'],
        settings['World Scale'],
      ])
    );

    renderPassDescriptor.colorAttachments[0].view = context
      .getCurrentTexture()
      .createView();

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(currentPipeline);
    passEncoder.setBindGroup(0, frameBGDescriptor.bindGroups[0]);
    passEncoder.setBindGroup(1, storageBGDescriptor.bindGroups[0]);
    passEncoder.setVertexBuffer(0, terrainRenderable.vertexBuffer);
    // Pass indices at uint32 since 257 by 257 texture goes beyond 2^16
    passEncoder.setIndexBuffer(terrainRenderable.indexBuffer, 'uint32');
    passEncoder.drawIndexed(terrainRenderable.indexCount);
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};

const TerrainGen: () => JSX.Element = () =>
  makeSample({
    name: 'Terrain Gen',
    description: '(WIP) Generating terrain from a heightmap',
    gui: true,
    init,
    sources: [
      {
        name: __filename.substring(__dirname.length + 1),
        contents: __SOURCE__,
      },
      {
        name: './heightFromTexture.wgsl',
        contents: heightsFromTextureWGSL,
        editable: true,
      },
      {
        name: './utils.ts',
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        contents: require('!!raw-loader!./utils.ts').default,
      },
    ],
    filename: __filename,
  });

export default TerrainGen;
