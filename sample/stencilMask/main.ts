import { mat4, vec3 } from 'wgpu-matrix';

import {
  cubeVertexArray,
  cubeVertexSize,
  cubeUVOffset,
  cubePositionOffset,
  cubeVertexCount,
} from '../../meshes/cube';

interface StencilMaskPipelineSetting {
  maskPipeline: GPURenderPipeline;
  renderPipeline: GPURenderPipeline;
}

// Stencil Mask Shader
import fullscreenQuadWGSL from './fullscreenQuad.vert.wgsl';
import circleSDFWGSL from './circleSDF.frag.wgsl';

// Cube render shader
import instancedVertWGSL from './instanced.vert.wgsl';
import vertexPositionColorWGSL from '../../shaders/vertexPositionColor.frag.wgsl';
import { GUI } from 'dat.gui';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
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

const settings = {
  sdf: 'circle',
  showRed: false,
  showGreen: false,
  showBlue: false,
};

const gui = new GUI();
gui.add(settings, 'sdf', ['circle']);
gui.add(settings, 'showRed');
gui.add(settings, 'showGreen');
gui.add(settings, 'showBlue');

// A good portion of this code is shared with the 'Instanced Cube' sample, but
// pay attention to the different ways in which pipelines and renderDescriptors
// are set up to account for the new stencil pass.

const depthTexture = device.createTexture({
  size: [canvas.width, canvas.height],
  format: 'depth24plus-stencil8',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

/*const createStencilMaskPipeline = (sdfCode: string, invertMask: boolean, showRed: boolean, showGreen: boolean, showBlue: boolean) => {
  return device.create
} */

// Create our mask shader, which will only write to the stencil buffer.
const stencilMaskPipeline = device.createRenderPipeline({
  label: 'StencilMask.renderPipeline',
  vertex: {
    module: device.createShaderModule({
      label: 'StencilMask.vertexShader',
      code: fullscreenQuadWGSL,
    }),
  },
  fragment: {
    module: device.createShaderModule({
      label: 'StencilMask.fragmentShader',
      code: circleSDFWGSL,
    }),
    targets: [
      {
        format: presentationFormat,
        // Write mask specifices which channel our shader will write to.
        // 0 is effectively equivalent to GPUColorWrite.NONE.
        writeMask: 0,
      },
    ],
  },
  // We will write to our depth/stencil texture, but only with stencil values
  depthStencil: {
    format: 'depth24plus-stencil8',
    depthWriteEnabled: false,
    // Stencil front and stencil back define state of stencil comparisons for
    // front-facing and back-facing primitives respectively. For the sake of
    // this example, they are treated the same.
    stencilFront: {
      // IE, if we write to this pixel in our shader, the stencil test will always succeed
      // And the corresponding pixel will be written to in the stencil buffer.
      compare: 'always',
      // The value at this pixel in the stencil buffer will be replaced by a reference value
      // This value is set per frame via the a GPURenderPassEncoders setStencilReference() function
      passOp: 'replace',
    },
    stencilBack: {
      compare: 'always',
      passOp: 'replace',
    },
    stencilWriteMask: 0xff,
  },
  layout: 'auto',
});

const stencilMaskPassDescriptor: GPURenderPassDescriptor = {
  // Although we are not writing to color in the stencil mask, it's still necessary
  // to pass our renderDescriptor a color attachment
  colorAttachments: [
    {
      view: undefined,
      clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
      loadOp: 'clear',
      storeOp: 'store',
    },
  ],
  depthStencilAttachment: {
    view: depthTexture.createView(),
    // Depth load and store ops still need to be defined with a 'depth24plus-stencil8' texture
    // With just 'stencil8', only the stencil ops are necessary
    depthClearValue: 1.0,
    depthLoadOp: 'clear',
    depthStoreOp: 'store',
    // Clear any extant stencil values within the depth texture.
    // If stencilLoadOp is clear, clear it to stencilClearValue.
    stencilLoadOp: 'clear',
    stencilClearValue: 0,
    stencilStoreOp: 'store',
  },
};

// Create a vertex buffer from the cube data.
const verticesBuffer = device.createBuffer({
  size: cubeVertexArray.byteLength,
  usage: GPUBufferUsage.VERTEX,
  mappedAtCreation: true,
});
new Float32Array(verticesBuffer.getMappedRange()).set(cubeVertexArray);
verticesBuffer.unmap();

const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: {
    module: device.createShaderModule({
      code: instancedVertWGSL,
    }),
    buffers: [
      {
        arrayStride: cubeVertexSize,
        attributes: [
          {
            // position
            shaderLocation: 0,
            offset: cubePositionOffset,
            format: 'float32x4',
          },
          {
            // uv
            shaderLocation: 1,
            offset: cubeUVOffset,
            format: 'float32x2',
          },
        ],
      },
    ],
  },
  fragment: {
    module: device.createShaderModule({
      code: vertexPositionColorWGSL,
    }),
    targets: [
      {
        format: presentationFormat,
      },
    ],
  },
  primitive: {
    topology: 'triangle-list',

    // Backface culling since the cube is solid piece of geometry.
    // Faces pointing away from the camera will be occluded by faces
    // pointing toward the camera.
    cullMode: 'back',
  },

  // Enable depth testing so that the fragment closest to the camera
  // is rendered in front.
  depthStencil: {
    depthWriteEnabled: true,
    depthCompare: 'less',
    format: 'depth24plus-stencil8',
    stencilFront: {
      compare: 'not-equal',
      passOp: 'keep',
      failOp: 'zero',
    },
    stencilBack: {
      compare: 'not-equal',
      passOp: 'keep',
      failOp: 'zero',
    },
    stencilReadMask: 0xff,
  },
});

const xCount = 4;
const yCount = 4;
const numInstances = xCount * yCount;
const matrixFloatCount = 16; // 4x4 matrix
const matrixSize = 4 * matrixFloatCount;
const uniformBufferSize = numInstances * matrixSize;

// Allocate a buffer large enough to hold transforms for every
// instance.
const uniformBuffer = device.createBuffer({
  size: uniformBufferSize,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const uniformBindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: {
        buffer: uniformBuffer,
      },
    },
  ],
});

const aspect = canvas.width / canvas.height;
const projectionMatrix = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 100.0);

type Mat4 = mat4.default;
const modelMatrices = new Array<Mat4>(numInstances);
const mvpMatricesData = new Float32Array(matrixFloatCount * numInstances);

const step = 4.0;

// Initialize the matrix data for every instance.
let m = 0;
for (let x = 0; x < xCount; x++) {
  for (let y = 0; y < yCount; y++) {
    modelMatrices[m] = mat4.translation(
      vec3.fromValues(
        step * (x - xCount / 2 + 0.5),
        step * (y - yCount / 2 + 0.5),
        0
      )
    );
    m++;
  }
}

const viewMatrix = mat4.translation(vec3.fromValues(0, 0, -12));

const tmpMat4 = mat4.create();

// Update the transformation matrix data for each instance.
function updateTransformationMatrix() {
  const now = Date.now() / 1000;

  let m = 0,
    i = 0;
  for (let x = 0; x < xCount; x++) {
    for (let y = 0; y < yCount; y++) {
      mat4.rotate(
        modelMatrices[i],
        vec3.fromValues(
          Math.sin((x + 0.5) * now),
          Math.cos((y + 0.5) * now),
          0
        ),
        1,
        tmpMat4
      );

      mat4.multiply(viewMatrix, tmpMat4, tmpMat4);
      mat4.multiply(projectionMatrix, tmpMat4, tmpMat4);

      mvpMatricesData.set(tmpMat4, m);

      i++;
      m += matrixFloatCount;
    }
  }
}

const renderPassDescriptor: GPURenderPassDescriptor = {
  colorAttachments: [
    {
      view: undefined, // Assigned later

      clearValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
      loadOp: 'load',
      storeOp: 'store',
    },
  ],
  depthStencilAttachment: {
    view: depthTexture.createView(),

    depthClearValue: 1.0,
    depthLoadOp: 'clear',
    depthStoreOp: 'store',
    // Load the stencil values from the previous pass
    stencilLoadOp: 'load',
    stencilStoreOp: 'store',
  },
};

function frame() {
  // Update the matrix data.
  updateTransformationMatrix();
  device.queue.writeBuffer(
    uniformBuffer,
    0,
    mvpMatricesData.buffer,
    mvpMatricesData.byteOffset,
    mvpMatricesData.byteLength
  );

  stencilMaskPassDescriptor.colorAttachments[0].view = context
    .getCurrentTexture()
    .createView();
  renderPassDescriptor.colorAttachments[0].view = context
    .getCurrentTexture()
    .createView();

  const commandEncoder = device.createCommandEncoder();

  const stencilPassEncoder = commandEncoder.beginRenderPass(
    stencilMaskPassDescriptor
  );
  stencilPassEncoder.setPipeline(stencilMaskPipeline);
  // Value that will be placed at pixel in stencil buffer when comparison succeeds
  stencilPassEncoder.setStencilReference(1);
  stencilPassEncoder.draw(6, 1);
  stencilPassEncoder.end();

  // Cube pass
  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, uniformBindGroup);
  passEncoder.setVertexBuffer(0, verticesBuffer);
  // Keep stencil buffer value if cube intersects with areas where stencil buffer equals 1.
  passEncoder.setStencilReference(1);
  passEncoder.draw(cubeVertexCount, numInstances, 0, 0);
  passEncoder.end();
  device.queue.submit([commandEncoder.finish()]);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
