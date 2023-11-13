import { mat4 } from 'wgpu-matrix';
import { makeSample, SampleInit } from '../../components/SampleLayout';
import { createMeshRenderable } from '../../meshes/mesh';
import heightsFromTextureWGSL from './heightsFromTexture.wgsl';
import { create3DRenderPipeline, createBindGroupCluster } from './utils';
import {
  createTerrainMesh,
  getHeightsFromTexture,
  TerrainDescriptor,
} from './terrain';
import terrainWGSL from './terrain.wgsl';

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
    cameraPosX: 0.0,
    cameraPosY: 0.8,
    cameraPosZ: -1.4,
    lightPosX: 1.7,
    lightPosY: 0.7,
    lightPosZ: -1.9,
    lightIntensity: 0.02,
  };

  const depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  
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

  const vertexBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * 3 * heights.length,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
  });

  let heightBitmap;
  {
    const response = await fetch('../assets/img/iceland_heightmap.png');
    heightBitmap = await createImageBitmap(await response.blob());
  }
  // Create default terrain from heightmap
  const terrainDescriptor: TerrainDescriptor = new TerrainDescriptor({});
  const heightsTest = getHeightsFromTexture(device, heightBitmap, 'CPU');
  const terrainMesh = createTerrainMesh(terrainDescriptor, heightsTest);
  const terrainRenderable = createMeshRenderable(
    device,
    terrainMesh,
    false,
    false
  );

  const spaceUniformsBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * 16 * 4,
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

  const terrainPipeline = create3DRenderPipeline(
    device,
    'TerrainRenderer',
    [frameBGDescriptor.bindGroupLayout],
    terrainWGSL,
    // Position,   normal
    ['float32x3', 'float32x3'],
    terrainWGSL,
    presentationFormat,
    true,
  );

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
    10.0
  ) as Float32Array;

  function getViewMatrix() {
    return mat4.lookAt(
      [settings.cameraPosX, settings.cameraPosY, settings.cameraPosZ],
      [0, 0, 0],
      [0, 1, 0]
    );
  }

  function getModelMatrix() {
    const modelMatrix = mat4.create();
    mat4.identity(modelMatrix);
    const now = Date.now() / 1000;
    mat4.rotateY(modelMatrix, now * -0.5, modelMatrix);
    return modelMatrix;
  }

  function frame() {
    if (!pageState.active) return;

    // Write to normal map shader
    const viewMatrix = getViewMatrix();

    const modelMatrix = getModelMatrix();

    const matrices = new Float32Array([
      ...projectionMatrix,
      ...viewMatrix,
      ...modelMatrix,
    ]);

    device.queue.writeBuffer(
      spaceUniformsBuffer,
      0,
      matrices.buffer,
      matrices.byteOffset,
      matrices.byteLength
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
    passEncoder.setIndexBuffer(terrainRenderable.indexBuffer, 'uint16');
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
