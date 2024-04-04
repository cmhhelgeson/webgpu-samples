import { mat4, vec3 } from 'wgpu-matrix';

import {
  cubeVertexArray,
  cubeVertexSize,
  cubeUVOffset,
  cubePositionOffset,
  cubeVertexCount,
} from '../../meshes/cube';

import instancedVertWGSL from './instanced.vert.wgsl';
import meshWGSL from './mesh.frag..wgsl';
//import { createSphereRenderable } from './utils';

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

//const sphere = createSphereRenderable(device, 0.025);

const buffInfo = {
  size: Float32Array.BYTES_PER_ELEMENT * numSpheres,
  usage: GPUBufferUsage.STORAGE,
};

// Position elements
const posXBuffer = device.createBuffer({
  label: 'posXBuffer',
  ...buffInfo,
});
const posYBuffer = device.createBuffer({
  label: 'posYBuffer',
  ...buffInfo,
});
const posZBuffer = device.createBuffer({
  label: 'posZBuffer',
  ...buffInfo,
});
const velXBuffer = device.createBuffer({
  label: 'velXBuffer',
  ...buffInfo,
});
const velYBuffer = device.createBuffer({
  label: 'velYBuffer',
  ...buffInfo,
});
const velZBuffer = device.createBuffer({
  label: 'velZBuffer',
  ...buffInfo,
});

const storageBuffers = [
  posXBuffer,
  posYBuffer,
  posZBuffer,
  velXBuffer,
  velYBuffer,
  velZBuffer,
];

const storageBGLEntries: GPUBindGroupLayoutEntry[] = [];
const storageBGEntries: GPUBindGroupEntry[] = [];

for (let i = 0; i < 6; i++) {
  storageBGLEntries.push({
    binding: i,
    buffer: {
      type: 'storage',
    },
    visibility: GPUShaderStage.VERTEX,
  });
  storageBGEntries.push({
    binding: i,
    resource: {
      buffer: storageBuffers[i],
    },
  });
}

const storageBGLayout = device.createBindGroupLayout({
  label: 'StorageBuffers.bindGroupLayout',
  entries: storageBGLEntries,
});

const storageBindGroup = device.createBindGroup({
  layout: storageBGLayout,
  label: 'StorageBuffers.bindGroup',
  entries: storageBGEntries,
});

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
      code: meshWGSL,
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
    format: 'depth24plus',
  },
});

const depthTexture = device.createTexture({
  size: [canvas.width, canvas.height],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
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

  renderPassDescriptor.colorAttachments[0].view = context
    .getCurrentTexture()
    .createView();

  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, uniformBindGroup);
  // passEncoder.setBindGroup(1, storageBindGroup)
  passEncoder.setVertexBuffer(0, verticesBuffer);
  passEncoder.draw(cubeVertexCount, numInstances, 0, 0);
  passEncoder.end();
  device.queue.submit([commandEncoder.finish()]);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
