import { mat4, vec3 } from 'wgpu-matrix';
import { makeSample, SampleInit } from '../../components/SampleLayout';
import firstPassWGSL from './firstPass.wgsl';
import { ArcballCamera, WASDCamera, cameraSourceInfo } from '../cameras/camera';
import { createInputHandler, inputSourceInfo } from '../cameras/input';
import {
  create3DRenderPipeline,
  createBindGroupCluster,
  createRenderPassColorAttachments,
  createTextureFromImage,
} from './utils';
import { createBoxMesh } from '../../meshes/box';
import { createMeshRenderable } from '../../meshes/mesh';
import vertexTextureQuadWGSL from './vertexTextureQuad.wgsl';
import secondPassWGSL from './secondPass.wgsl';

const init: SampleInit = async ({ canvas, pageState, gui }) => {
  if (!pageState.active) {
    return;
  }
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

  // The input handler
  const inputHandler = createInputHandler(window, canvas);

  // The camera types
  const initialCameraPosition = vec3.create(3, 2, 5);
  const cameras = {
    arcball: new ArcballCamera({ position: initialCameraPosition }),
    WASD: new WASDCamera({ position: initialCameraPosition }),
  };

  // GUI parameters
  const settings = {
    type: 'arcball',
    'Render Mode': 'POSITIONS',
    'Velocity Scale': 1.0,
    'Velocity Samples': 2,
    'Scale On': true,
    'Scale Speed': 1,
  };

  // Define resources for first pass
  const boxMesh = createBoxMesh(1, 1, 1);
  const box = createMeshRenderable(device, boxMesh);

  const uniformBufferSize = 4 * 16 * 4; // 4 4x4 matrices
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Fetch the image and upload it into a GPUTexture.
  let cubeTexture: GPUTexture;
  {
    const response = await fetch('../assets/img/Di-3d.png');
    const imageBitmap = await createImageBitmap(await response.blob());
    cubeTexture = createTextureFromImage(device, imageBitmap);
  }

  // Create a sampler with linear filtering for smooth interpolation.
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const firstPassBGCluster = createBindGroupCluster(
    [0, 1, 2],
    [GPUShaderStage.VERTEX, GPUShaderStage.FRAGMENT, GPUShaderStage.FRAGMENT],
    ['buffer', 'sampler', 'texture'],
    [{ type: 'uniform' }, { type: 'filtering' }, { sampleType: 'float' }],
    [[{ buffer: uniformBuffer }, sampler, cubeTexture.createView()]],
    'FirstPass',
    device
  );

  // Initial color pass without blur
  const firstPassColorTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: presentationFormat,
  });

  // Per pixel vec2<f32> velocity pass
  const firstPassVelocityTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba16float',
  });

  const firstPassPipeline = create3DRenderPipeline(device, {
    label: 'FirstPass',
    bgLayouts: [firstPassBGCluster.bindGroupLayout],
    vertexShader: firstPassWGSL,
    fragmentShader: firstPassWGSL,
    vBufferFormats: box.vertexFormats,
    colorTargets: [
      // Color output
      {
        format: presentationFormat,
      },
      // Velocity output
      {
        format: firstPassVelocityTexture.format,
      },
    ],
  });

  const depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const firstPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: createRenderPassColorAttachments(
      device,
      [firstPassColorTexture, firstPassVelocityTexture],
      { r: 0.5, g: 0.5, b: 0.5, a: 1.0 }
    ),
    depthStencilAttachment: {
      view: depthTexture.createView(),

      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  };

  // Define resources for second pass

  const secondPassUniformsBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * 2,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const secondPassSampler = device.createSampler({
    minFilter: 'nearest',
    magFilter: 'nearest',
  });

  const secondPassBGCluster = createBindGroupCluster(
    [0, 1, 2, 3],
    [GPUShaderStage.FRAGMENT],
    ['texture', 'texture', 'buffer', 'sampler'],
    [
      { sampleType: 'float' },
      { sampleType: 'unfilterable-float' },
      { type: 'uniform' },
      { type: 'filtering' },
    ],
    [
      [
        firstPassColorTexture.createView(),
        firstPassVelocityTexture.createView(),
        { buffer: secondPassUniformsBuffer },
        secondPassSampler,
      ],
    ],
    'SecondPass',
    device
  );

  const secondPassPipeline = create3DRenderPipeline(device, {
    label: 'SecondPass',
    bgLayouts: [secondPassBGCluster.bindGroupLayout],
    vertexShader: vertexTextureQuadWGSL,
    fragmentShader: secondPassWGSL,
    vBufferFormats: [],
    colorTargets: [
      // Final color output
      {
        format: presentationFormat,
      },
    ],
    depthTest: false,
  });

  const secondPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: undefined,
        clearValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  const aspect = canvas.width / canvas.height;
  const projectionMatrix = mat4.perspective(
    (2 * Math.PI) / 5,
    aspect,
    1,
    100.0
  );

  function getModelMatrix(deltaTime: number) {
    const modelMatrix = mat4.create();
    mat4.identity(modelMatrix);
    const now = Date.now() / 1000;
    mat4.rotateY(modelMatrix, now * 20, modelMatrix);

    return modelMatrix;
  }

  const prevModelViewMat = mat4.create();
  const currModelViewMat = mat4.create();
  const prevModelViewProjMat = mat4.create();
  const currModelViewProjMat = mat4.create();

  function getMatrices(deltaTime: number) {
    // Copy current matrices into prev matrices
    mat4.copy(currModelViewMat, prevModelViewMat);
    mat4.copy(currModelViewProjMat, prevModelViewProjMat);
    //Update the camera/viewMatrix (only exists in this scope)
    const currViewMat = mat4.create();
    const camera = cameras[settings.type];
    mat4.copy(camera.update(deltaTime, inputHandler()), currViewMat);
    //Multiply the modelMatrix with the view matrix, and place value in modelViewMatrix
    mat4.multiply(currViewMat, getModelMatrix(deltaTime), currModelViewMat);
    //Multiply the projection Matrix with the modelViewMatrix
    mat4.multiply(projectionMatrix, currModelViewMat, currModelViewProjMat);
    return {
      prevView: prevModelViewMat as Float32Array,
      currView: currModelViewMat as Float32Array,
      prevViewProj: prevModelViewProjMat as Float32Array,
      currViewProj: currModelViewProjMat as Float32Array,
    };
  }

  // Callback handler for camera mode
  let oldCameraType = settings.type;
  if (!gui.__folders.Velocity) {
    const velocityFolder = gui.addFolder('Velocity');
    velocityFolder.add(settings, 'Velocity Scale', 0.1, 10.0, 0.1);
    velocityFolder.add(settings, 'Velocity Samples', 1, 30).step(1);
  }
  if (!gui.__folders.Scale) {
    const scaleFolder = gui.addFolder('Scale');
    const scaleOnController = scaleFolder
      .add(settings, 'Scale On')
      .onChange(() => scaleOnController.setValue(!settings['Scale On']));
    scaleFolder.add(settings, 'Scale Speed', 1, 50).step(1);
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

    const modelViewProjection = getMatrices(deltaTime);
    // Write to first pass
    device.queue.writeBuffer(
      uniformBuffer,
      0,
      modelViewProjection.prevView.buffer,
      modelViewProjection.prevView.byteOffset,
      modelViewProjection.prevView.byteLength
    );
    device.queue.writeBuffer(
      uniformBuffer,
      64,
      modelViewProjection.currView.buffer,
      modelViewProjection.currView.byteOffset,
      modelViewProjection.currView.byteLength
    );
    device.queue.writeBuffer(
      uniformBuffer,
      128,
      modelViewProjection.prevViewProj.buffer,
      modelViewProjection.prevViewProj.byteOffset,
      modelViewProjection.prevViewProj.byteLength
    );
    device.queue.writeBuffer(
      uniformBuffer,
      192,
      modelViewProjection.currViewProj.buffer,
      modelViewProjection.currViewProj.byteOffset,
      modelViewProjection.currViewProj.byteLength
    );

    // Write to second pass
    device.queue.writeBuffer(
      secondPassUniformsBuffer,
      0,
      new Float32Array([settings['Velocity Scale']])
    );

    device.queue.writeBuffer(
      secondPassUniformsBuffer,
      4,
      new Uint32Array([settings['Velocity Scale']])
    );

    // Run first pass
    const commandEncoder = device.createCommandEncoder();
    const firstPassEncoder =
      commandEncoder.beginRenderPass(firstPassDescriptor);
    firstPassEncoder.setPipeline(firstPassPipeline);
    firstPassEncoder.setBindGroup(0, firstPassBGCluster.bindGroups[0]);
    firstPassEncoder.setVertexBuffer(0, box.vertexBuffer);
    firstPassEncoder.setIndexBuffer(box.indexBuffer, 'uint16');
    firstPassEncoder.drawIndexed(box.indexCount);
    firstPassEncoder.end();

    // Run second pass
    secondPassDescriptor.colorAttachments[0].view = context
      .getCurrentTexture()
      .createView();
    const secondPassEncoder =
      commandEncoder.beginRenderPass(secondPassDescriptor);
    secondPassEncoder.setPipeline(secondPassPipeline);
    secondPassEncoder.setBindGroup(0, secondPassBGCluster.bindGroups[0]);
    // Draw textured quad
    secondPassEncoder.draw(6);
    secondPassEncoder.end();

    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};

const MotionBlur: () => JSX.Element = () =>
  makeSample({
    name: 'Motion Blur',
    description: 'This example provides example camera implementations',
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
        name: '../../shaders/cube.wgsl',
        contents: firstPassWGSL,
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
