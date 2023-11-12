import { mat4 } from 'wgpu-matrix';
import { makeSample, SampleInit } from '../../components/SampleLayout';
import { createMeshRenderable } from '../../meshes/mesh';
import { createBoxMeshWithTangents } from '../../meshes/box';
import heightsFromTextureWGSL from './heightsFromTexture.wgsl';
import { createBindGroupCluster } from './utils';
import { createTerrainDescriptor, TerrainDescriptor } from './terrain';

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

  let imageBitmap;
  let heightMapTexture: GPUTexture;
  {
    const response = await fetch('../assets/img/iceland_heightmap.png');
    imageBitmap = await createImageBitmap(await response.blob());
    console.log(imageBitmap);
    heightMapTexture = device.createTexture({
      size: {
        width: imageBitmap.width,
        height: imageBitmap.height,
      },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  // Create default terrain from heightmap
  const terrainDescriptor: TerrainDescriptor = new TerrainDescriptor(device, {
    heightmap: heightMapTexture,
  });
  // Get size of heightmap
  // Create stating for CPU Data (Feel free to do this in the GPU I could not get it to work)
  let heights;
  {
    const offscreenCanvas = new OffscreenCanvas(
      imageBitmap.width,
      imageBitmap.height
    );
    const ctx = offscreenCanvas.getContext('2d');

    // Draw the ImageBitmap onto the OffscreenCanvas
    ctx.drawImage(imageBitmap, 0, 0);

    // Get the image data from the OffscreenCanvas
    const imageData = ctx.getImageData(
      0,
      0,
      imageBitmap.width,
      imageBitmap.height
    );

    // Create an ArrayBuffer to hold the normalized pixel data
    const floatArray = new Float32Array(imageBitmap.width * imageBitmap.height);

    // Convert and normalize pixel data (only getting r components)
    for (let i = 0; i < imageData.data.length / 4; i++) {
      floatArray[i] = imageData.data[i * 4] / 127.5; // Normalize to 0.0 - 1.0
    }
    heights = floatArray;
  }
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
