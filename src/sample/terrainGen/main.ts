import { mat4 } from 'wgpu-matrix';
import { makeSample, SampleInit } from '../../components/SampleLayout';
import { createMeshRenderable } from '../../meshes/mesh';
import { createBoxMeshWithTangents } from '../../meshes/box';
import heightsFromTextureWGSL from './heightsFromTexture.wgsl';
import {
  createBindGroupDescriptor,
  create3DRenderPipeline,
  createTextureFromImage,
  createBindGroupCluster,
} from './utils';
import { TerrainDescriptor } from './terrain';

interface GUISettings {
  'Bump Mode':
    | 'Diffuse Texture'
    | 'Normal Texture'
    | 'Depth Texture'
    | 'Normal Map'
    | 'Parallax Scale'
    | 'Steep Parallax';
  cameraPosX: number;
  cameraPosY: number;
  cameraPosZ: number;
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
    'Bump Mode': 'Normal Map',
    cameraPosX: 0.0,
    cameraPosY: 0.8,
    cameraPosZ: -1.4,
  };

  // Create normal mapping resources and pipeline
  const depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  let heightMapTexture: GPUTexture;
  {
    const response = await fetch('../assets/img/terrain_heightmap.png');
    const imageBitmap = await createImageBitmap(await response.blob());
    console.log(imageBitmap.width);
    console.log(imageBitmap.height);
    heightMapTexture = createTextureFromImage(device, imageBitmap);
  }

  // Init shared properties across all terrain instances
  TerrainDescriptor.initStaticProperties(device);
  const terrainDescriptor = new TerrainDescriptor(device, {
    heightmap: heightMapTexture,
  });
  terrainDescriptor.setHeightsBuffer(device);
  let heights: Float32Array;
  await terrainDescriptor
    .getHeights(device)
    .then((result) => (heights = result));
  console.log(heights);

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

  gui.add(settings, 'Bump Mode', [
    'Diffuse Texture',
    'Normal Texture',
    'Depth Texture',
    'Normal Map',
    'Parallax Scale',
    'Steep Parallax',
  ]);
  const lightFolder = gui.addFolder('Light');
  const depthFolder = gui.addFolder('Depth');
  lightFolder.add(settings, 'Reset Light').onChange(() => {
    lightPosXController.setValue(1.7);
    lightPosYController.setValue(0.7);
    lightPosZController.setValue(-1.9);
    lightIntensityController.setValue(0.02);
  });
  const lightPosXController = lightFolder
    .add(settings, 'lightPosX', -5, 5)
    .step(0.1);
  const lightPosYController = lightFolder
    .add(settings, 'lightPosY', -5, 5)
    .step(0.1);
  const lightPosZController = lightFolder
    .add(settings, 'lightPosZ', -5, 5)
    .step(0.1);
  const lightIntensityController = lightFolder
    .add(settings, 'lightIntensity', 0.0, 0.1)
    .step(0.002);
  depthFolder.add(settings, 'depthScale', 0.0, 0.1).step(0.01);
  depthFolder.add(settings, 'depthLayers', 1, 32).step(1);

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

    renderPassDescriptor.colorAttachments[0].view = context
      .getCurrentTexture()
      .createView();

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
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
