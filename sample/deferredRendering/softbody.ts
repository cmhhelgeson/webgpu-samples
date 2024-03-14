import presolveWGSL from './presolve.wgsl';
import solveEdgeWGSL from './solveEdge.wgsl';
import solveVolumeWGSL from './solveVolumes.wgsl'
import postSolveWGSL from './postSolve.wgsl';

interface SoftBodyMeshConstructorArgs {
  device: GPUDevice;
  mesh: {
    positions: [number, number, number][];
    triangles: [number, number, number][];
    normals: [number, number, number][];
    uvs: [number, number][];
    tetEdgeIds: [number, number];
    tetVolumeIds: [number, number, number, number];
  };
}

const createReadOnlyStorageLayoutEntry = (index: number): GPUBindGroupLayoutEntry => {
  return {
    binding: index,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: 'read-only-storage'
    }
  }
}

const createBindGroupBufferEntry = (index: number, buffer: GPUBuffer): GPUBindGroupEntry => {
  return {
    binding: index,
    resource: {
      buffer,
    }
  }
};

class SoftBodyMesh {
  // Per vertex information
  public numVertices: number;
  public vertexBuffer: GPUBuffer;
  public prevPositionsBuffer: GPUBuffer;
  public velocitiesBuffer: GPUBuffer;
  public vertexBufferLayout: Iterable<GPUVertexBufferLayout>;

  // Triangle index information
  public indexCount: number;
  public indexBuffer: GPUBuffer;
  // Tetrahedron information
  // The number of tetrahedrons used within the mesh
  private numTets: number;
  // The number of tetrahedron edges in the mesh
  private numEdges: number;

  // read-only storage buffers
  private tetEdgeIdsBuffer: GPUBuffer;
  private tetVolumeIdsBuffer: GPUBuffer;
  private restVolumeBuffer: GPUBuffer;
  private inverseMassBuffer: GPUBuffer;

  private readOnlyBindGroup: GPUBindGroup;

  //Compute pipelines
  private preSolvePipeline: GPUComputePipeline;
  private solveEdgePipeline: GPUComputePipeline;
  private solveVolumePipeline: GPUComputePipeline;
  private postSolvePipeline: GPUComputePipeline;
  // Re-calc normals pipeline
  // private calcNormalsPipeline: GPUComputePipeline

  private createReadOnlyStorageBindGroup(device: GPUDevice) {
    const bgLayout = device.createBindGroupLayout({
      entries: [
        // Tetrahedron Volume Id
        createReadOnlyStorageLayoutEntry(0),
        // Tetrahedron Edge Id
        createReadOnlyStorageLayoutEntry(1),
        // Rest Volume
        createReadOnlyStorageLayoutEntry(2),
        // Inverse Mass
        createReadOnlyStorageLayoutEntry(3),
      ]
    });

    this.readOnlyBindGroup = device.createBindGroup({
      layout: bgLayout,
      entries: [
        createBindGroupBufferEntry(0, this.tetEdgeIdsBuffer),
        createBindGroupBufferEntry(1, this.tetVolumeIdsBuffer),
        createBindGroupBufferEntry(2, this.restVolumeBuffer),
        createBindGroupBufferEntry(3, this.inverseMassBuffer),
      ]
    })

  };

  private createSoftBodyComputePipelines(device: GPUDevice) {
    const createSoftBodyComputePipeline = (code: string, entryPoint: string) => {
      return device.createComputePipeline({
        label: `SoftBody.computePipeline: ${entryPoint}`,
        compute: {
          module: device.createShaderModule({
            code: code,
          }),
          entryPoint,
        },
        layout: 'auto'
      })
    }
    this.preSolvePipeline = createSoftBodyComputePipeline(presolveWGSL, 'preSolve');
    this.solveEdgePipeline = createSoftBodyComputePipeline(solveEdgeWGSL, 'solveEdge');
    this.solveVolumePipeline = createSoftBodyComputePipeline(solveVolumeWGSL, 'solveVolume');
    this.postSolvePipeline = createSoftBodyComputePipeline(postSolveWGSL, 'postSolve');
  }


  constructor({ device, mesh }: SoftBodyMeshConstructorArgs) {
    // Create vertex buffers
    const vertexStride = 8;
    // Only going to worry about positions for now
    this.numVertices = mesh.positions.length;
    // Create a buffer that represents the vertices positions on the last frame
    this.prevPositionsBuffer = device.createBuffer({
      // Prev positions represented as a vec4
      size: this.numVertices * Float32Array.BYTES_PER_ELEMENT * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });

    //Create a buffer that represents the 3D velocities of each vertex
    this.velocitiesBuffer = device.createBuffer({
      size: this.numVertices * Float32Array.BYTES_PER_ELEMENT * 3,
      usage: GPUBufferUsage.STORAGE,
    });

    // Now the buffer that represents the vertex positions for the current frame
    this.vertexBuffer = device.createBuffer({
      // position: vec3, normal: vec3, uv: vec2
      size: this.numVertices * 8 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });
    const mapping = new Float32Array(this.vertexBuffer.getMappedRange());
    for (let i = 0; i < mesh.positions.length; ++i) {
      mapping.set(mesh.positions[i], vertexStride * i);
      mapping.set(mesh.normals[i], vertexStride * i + 3);
      mapping.set(mesh.uvs[i], vertexStride * i + 6);
    }
    this.vertexBuffer.unmap();

    this.vertexBufferLayout = [
      {
        arrayStride: Float32Array.BYTES_PER_ELEMENT * 8,
        attributes: [
          {
            // position
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3',
          },
          {
            // normal
            shaderLocation: 1,
            offset: Float32Array.BYTES_PER_ELEMENT * 3,
            format: 'float32x3',
          },
          {
            // uv
            shaderLocation: 2,
            offset: Float32Array.BYTES_PER_ELEMENT * 6,
            format: 'float32x2',
          },
        ],
      },
    ];

    // Create index buffers
    this.indexCount = mesh.triangles.length * 3;
    this.indexBuffer = device.createBuffer({
      size: this.indexCount * Uint16Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.INDEX,
      mappedAtCreation: true,
    });
    {
      const mapping = new Uint16Array(this.indexBuffer.getMappedRange());
      for (let i = 0; i < mesh.triangles.length; ++i) {
        mapping.set(mesh.triangles[i], 3 * i);
      }
      this.indexBuffer.unmap();
    }
    // Calculate the number of tetrahedrons by the number of tetrahedron volumes (length of number[][])
    this.numTets = mesh.tetVolumeIds.length;

    const tetVolumeIdsBuffer = device.createBuffer({
      // numTets * indices per tet * u32 size
      size: Uint32Array.BYTES_PER_ELEMENT * 4 * this.numTets,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });
    {
      const mapping = new Uint32Array(this.indexBuffer.getMappedRange());
      for (let i = 0; i < this.numTets; ++i) {
        mapping.set(mesh.tetVolumeIds, 4 * i);
      }
      this.indexBuffer.unmap();
    }

    this.createSoftBodyComputePipelines(device);


  }


  // Run the computePipelines
  run(commandEncoder: GPUCommandEncoder, workgroupSizeLimit: number) {
    // Calculate number of dispatches needed for each step of compute
    const preSolveDispatches = Math.ceil(this.numVertices / workgroupSizeLimit);
    const solveVolumeDispatches = Math.ceil(this.numTets / workgroupSizeLimit);
    const solveEdgesDispatches = Math.ceil(this.numEdges / workgroupSizeLimit);
    const postSolveDispatches = Math.ceil(this.numVertices / workgroupSizeLimit);

    // Pre-solve step
    const preSolvePassEncoder = commandEncoder.beginComputePass();

  }
}
