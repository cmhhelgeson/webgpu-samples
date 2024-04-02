import VectorAddNaiveWGSL from './vectorAdd/vectorAddNaive.wgsl';
import VectorAddWorkgroupWGSL from './vectorAdd/vectorAddWorkgroup.wgsl';

interface AlgorithmGPUResourceRecord {
  pipeline: GPUComputePipeline;
  workgroupsToDispatch: [number, number, number]
}

class PerformanceInterface {
  cpuImplementation: () => void;
  protected gpuImplementations: Record<string, AlgorithmGPUResourceRecord>;

  run(commandEncoder: GPUCommandEncoder, bindGroups: GPUBindGroup[], impl1: string, impl2: string) {
    const impl1Pass = commandEncoder.beginComputePass();
    impl1Pass.setPipeline(this.gpuImplementations[impl1].pipeline);
    for (let i = 0; i < bindGroups.length; i++) {
      impl1Pass.setBindGroup(i, bindGroups[i]);
    }
    let workgroups = this.gpuImplementations[impl1].workgroupsToDispatch
    impl1Pass.dispatchWorkgroups(workgroups[0], workgroups[1], workgroups[2]);
    impl1Pass.end();

    const impl2Pass = commandEncoder.beginComputePass();
    impl2Pass.setPipeline(this.gpuImplementations[impl2].pipeline);
    for (let i = 0; i < bindGroups.length; i++) {
      impl2Pass.setBindGroup(i, bindGroups[i]);
    }
    workgroups = this.gpuImplementations[impl2].workgroupsToDispatch
    impl2Pass.dispatchWorkgroups(workgroups[0], workgroups[1], workgroups[2])
    impl2Pass.end();
  }
}

interface VectorAddArgs {
  device: GPUDevice;
  vectorSize: number;
}

const genComputePipeline = (device: GPUDevice, label: string, code: string) => {
  return device.createComputePipeline({
    label,
    compute: {
      module: device.createShaderModule({
        code,
      })
    },
    layout: 'auto',
  })
}

class VectorAdd extends PerformanceInterface {
  private vectorA: Float32Array;
  private vectorB: Float32Array;
  private vectorC: Float32Array;
  private vectorABuffer: GPUBuffer;
  private vectorBBuffer: GPUBuffer;
  private vectorCBuffer: GPUBuffer;

  private bindGroup: GPUBindGroup;
  

  constructor({device, vectorSize}: VectorAddArgs) {
    super();

    const size = Float32Array.BYTES_PER_ELEMENT * vectorSize;
    const bufInfo: GPUBufferDescriptor = {
      size,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    }
    
    // Initialize randomly
    this.vectorA = new Float32Array(vectorSize);
    this.vectorB = new Float32Array(vectorSize);
    this.vectorC = new Float32Array(vectorSize);
    this.vectorABuffer = device.createBuffer(bufInfo);
    this.vectorBBuffer = device.createBuffer(bufInfo);
    this.vectorCBuffer = device.createBuffer({
      size,
      usage: GPUBufferUsage.STORAGE 
    });

    const vecAMapping = new Float32Array(this.vectorABuffer.getMappedRange());
    const vecBMapping = new Float32Array(this.vectorBBuffer.getMappedRange());

    for (let i = 0; i < vectorSize; i++) {
      const randA = Math.random() * 10.0 - 5.0;
      const randB = Math.random() * 10.0 - 5.0;
      this.vectorA[i] = randA;
      this.vectorB[i] = randB);
      vecAMapping.set([randA], i);
      vecBMapping.set([randB], i);
    }

    this.cpuImplementation = () => {
      for (let i = 0; i < vectorSize; i++) {
        this.vectorC[i] = this.vectorA[i] + this.vectorB[i];
      }
    };
    
    const naivePipeline = genComputePipeline(device, 'VectorAddNaive.computePipeline', VectorAddNaiveWGSL);
    const workgroupPipeline = genComputePipeline(device, 'VectorAddWorkgroup.computePipeline', VectorAddWorkgroupWGSL);

    this.gpuImplementations = {
      'Vector Add (Naive)': {
        pipeline: naivePipeline,
        workgroupsToDispatch: [Math.ceil(vectorSize / 64), 1, 1],
      },
      'Vector Add (Local Workgroup)': {
        pipeline: workgroupPipeline,
        workgroupsToDispatch: [Math.ceil(vectorSize / 64), 1, 1],
      }
    }

    this.bindGroup = device.createBindGroup({
      layout: naivePipeline.getBindGroupLayout(0),
      label: 'VectorAdd.bindGroup',
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.vectorABuffer,
          }
        },
        {
          binding: 1,
          resource: {
            buffer: this.vectorBBuffer,
          }
        },
        {
          binding: 2,
          resource: {
            buffer: this.vectorCBuffer,
          }
        }
      ],
    });
  }

  compute(commandEncoder: GPUCommandEncoder, impl1: string, impl2: string) {
    super.run(commandEncoder, [this.bindGroup], impl1, impl2);
  }
};

