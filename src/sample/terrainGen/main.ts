import { mat4, vec3 } from 'wgpu-matrix';
import { makeSample, SampleInit } from '../../components/SampleLayout';
import { createMeshRenderable } from '../../meshes/mesh';
import heightsFromTextureWGSL from './heightsFromTexture.wgsl';
import { create3DRenderPipeline, createBindGroupCluster, createVBuffer } from './utils';
import {
  createTerrainMesh,
  //getHeightsFromTexture,
  TerrainDescriptor,
} from './terrain';
import terrainWGSL from './terrain.wgsl';
import { WASDCamera } from '../cameras/camera';
import { createInputHandler } from '../cameras/input';

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
    cameraPosX: 231,
    cameraPosY: 180,
    cameraPosZ: 109,
    lightPosX: 1.7,
    lightPosY: 0.7,
    lightPosZ: -1.9,
    lightIntensity: 0.02,
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

  // Create terrain
  let heights: Float32Array;
  {
    const response = await fetch('../assets/heightmap.save');
    const buffer = await response.arrayBuffer();
    const floatArray = new Float32Array(buffer);
    heights = floatArray;
  }

  // Assuming heightmap is square
  const terrainSize = Math.sqrt(heights.length);
  console.log(terrainSize);
  // Create default terrain from heightmap
  const terrainDescriptor: TerrainDescriptor = new TerrainDescriptor({
    width: terrainSize,
    depth: terrainSize,
  });
  const terrainMesh = createTerrainMesh(terrainDescriptor, heights);
  const terrainRenderable = createMeshRenderable(
    device,
    terrainMesh,
    false,
    false
  );

  const spaceUniformsBuffer = device.createBuffer({
    // mat4x4f
    size: 64 * 2,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const lightUniformsBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * 4,
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

  const terrainPipelineVBuffers = createVBuffer(terrainMesh.vertexLayout);
  console.log(terrainPipelineVBuffers);
  const terrainPipeline = device.createRenderPipeline({
    label: 'TerrainRenderer.pipeline',
    layout: device.createPipelineLayout({
      bindGroupLayouts: [frameBGDescriptor.bindGroupLayout],
    }),
    vertex: {
      entryPoint: 'vertexMain',
      buffers: [terrainPipelineVBuffers],
      module: device.createShaderModule({
        label: 'TerrainRenderer.vertexShader',
        code: terrainWGSL,
      }),
    },
    fragment: {
      module: device.createShaderModule({
        label: `TerrainRenderer.fragmentShader`,
        code: terrainWGSL,
      }),
      entryPoint: 'fragmentMain',
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'back',
      frontFace: 'cw',
    },
    depthStencil: {
      depthCompare: 'less',
      depthWriteEnabled: true,
      format: 'depth24plus',
    },
  });

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

  gui.add(settings, 'cameraPosX', -100, 100);
  gui.add(settings, 'cameraPosY', -100, 100);
  gui.add(settings, 'cameraPosZ', -100, 100);

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
      ])
    );

    renderPassDescriptor.colorAttachments[0].view = context
      .getCurrentTexture()
      .createView();

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(terrainPipeline);
    passEncoder.setBindGroup(0, frameBGDescriptor.bindGroups[0]);
    passEncoder.setVertexBuffer(0, terrainRenderable.vertexBuffer);
    //passEncoder.setIndexBuffer(terrainRenderable.indexBuffer, 'uint16');
    passEncoder.draw(terrainSize * terrainSize);
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
