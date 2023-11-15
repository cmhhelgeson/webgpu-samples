import { mat4, vec3 } from 'wgpu-matrix';
import { makeSample, SampleInit } from '../../components/SampleLayout';
import mbPositionsWGSL from './mbPositions.wgsl';
import { WASDCamera, cameraSourceInfo } from '../cameras/camera';
import { createInputHandler, inputSourceInfo } from '../cameras/input';
import {
  create3DRenderPipeline,
  createBindGroupCluster,
  createTextureFromImage,
} from './utils';
import { createBoxMesh } from '../../meshes/box';
import { createMeshRenderable } from '../../meshes/mesh';

const init: SampleInit = async ({ canvas, pageState, gui }) => {
  if (!pageState.active) {
    return;
  }

  // Create camera and camera inputHandler
  const inputHandler = createInputHandler(window, canvas);
  const initialCameraPosition = vec3.create(3, 2, 5);
  const camera = new WASDCamera({
    position: initialCameraPosition,
  });

  // GUI settings
  const settings = {
    motionBlur: 'off',
  };

  // Callback handler for camera mode
  gui.add(settings, 'motionBlur', ['on', 'off']);

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
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

  // Create Uniform buffers for positions pipeline
  const Mat4x4fBytes = 64;
  const spaceTransformsBuffer = device.createBuffer({
    size: Mat4x4fBytes * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Get texture and texture linear interpolation sampler
  let cubeTexture: GPUTexture;
  {
    const response = await fetch('../assets/img/Di-3d.png');
    const imageBitmap = await createImageBitmap(await response.blob());
    cubeTexture = createTextureFromImage(device, imageBitmap);
  }
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const positionsBGCluster = createBindGroupCluster(
    [0, 1, 2],
    [GPUShaderStage.VERTEX, GPUShaderStage.FRAGMENT, GPUShaderStage.FRAGMENT],
    ['buffer', 'texture', 'sampler'],
    [{ type: 'uniform' }, { type: 'filtering' }, { sampleType: 'float' }],
    [[{ buffer: spaceTransformsBuffer }, cubeTexture.createView(), sampler]],
    'MB_Positions',
    device
  );

  const mbPostionsPipeline = create3DRenderPipeline(device, {
    label: 'MB_Positions',
    vertexShader: mbPositionsWGSL,
    fragmentShader: mbPositionsWGSL,
    vBufferFormats: ['float32x3', 'float32x3', 'float32x2'],
    bgLayouts: [positionsBGCluster.bindGroupLayout],
    // Write previous and current positions
    colorTargets: [
      {
        format: presentationFormat,
      },
    ],
  });

  const boxMesh = createBoxMesh(1, 1, 1);
  const box = createMeshRenderable(device, boxMesh);

  // Create renderPassDescriptor
  const depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: undefined, // Assigned later

        clearValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
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

  // Get projection and modelViewMatrixes
  const aspect = canvas.width / canvas.height;
  const projectionMatrix = mat4.perspective(
    (2 * Math.PI) / 5,
    aspect,
    1,
    100.0
  );

  // 0: prevView, 1: currView, 2: prevViewProj, 3: currViewProj
  const spaceTransformMatrices = [
    mat4.create(),
    mat4.create(),
    mat4.create(),
    mat4.create(),
  ];

  function updateMatrices(deltaTime: number) {
    // Pass previous frame's matrices into storage matrices
    mat4.copy(spaceTransformMatrices[1], spaceTransformMatrices[0]);
    mat4.copy(spaceTransformMatrices[3], spaceTransformMatrices[2]);
    // Calculate new view and viewProjection Matrices
    mat4.copy(
      camera.update(deltaTime, inputHandler()),
      spaceTransformMatrices[1]
    );
    mat4.multiply(
      projectionMatrix,
      spaceTransformMatrices[1],
      spaceTransformMatrices[3],
    );
  }

  let lastFrameMS = Date.now();

  function frame() {
    const now = Date.now();
    const deltaTime = (now - lastFrameMS) / 1000;
    lastFrameMS = now;

    if (!pageState.active) {
      // Sample is no longer the active page.
      return;
    }

    updateMatrices(deltaTime);
    for (let i = 0; i < 4; i++) {
      const arr = spaceTransformMatrices[i] as Float32Array
      device.queue.writeBuffer(
        spaceTransformsBuffer,
        i * 64,
        arr.buffer,
        arr.byteOffset,
        arr.byteLength
      );
    }

    renderPassDescriptor.colorAttachments[0].view = context
      .getCurrentTexture()
      .createView();

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(mbPostionsPipeline);
    passEncoder.setBindGroup(0, positionsBGCluster.bindGroups[0]);
    passEncoder.setVertexBuffer(0, box.vertexBuffer);
    passEncoder.setIndexBuffer(box.indexBuffer, 'uint16');
    passEncoder.drawIndexed(box.indexCount);
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};

const MotionBlur: () => JSX.Element = () =>
  makeSample({
    name: 'Motion Blur',
    description: 'This example provides a simple motion blur implementation',
    gui: true,
    init,
    sources: [
      {
        name: __filename.substring(__dirname.length + 1),
        contents: __SOURCE__,
      },
      cameraSourceInfo,
      inputSourceInfo,
      {
        name: '../../shaders/mbPositions.wgsl',
        contents: mbPositionsWGSL,
        editable: true,
      },
      {
        name: '../../meshes/box.ts',
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        contents: require('!!raw-loader!../../meshes/box.ts').default,
      },
    ],
    filename: __filename,
  });

export default MotionBlur;
