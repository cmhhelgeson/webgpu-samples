import presolveWGSL from './presolve.wgsl';
import solveEdgeWGSL from './solveEdge.wgsl';
import solveVolumeWGSL from './solveVolume.wgsl';
import postSolveWGSL from './postSolve.wgsl';
import commonsWGSL from './commons.wgsl';
import { Vec3, vec3 } from 'wgpu-matrix';

interface SoftBodyMeshConstructorArgs {
  device: GPUDevice;
  mesh: {
    positions: [number, number, number][];
    triangles: [number, number, number][];
    normals: [number, number, number][];
    uvs: [number, number][];
    tetEdgeIds: [number, number][];
    tetVolumeIds: [number, number, number, number][];
  };
}

interface UniformArgs {
  deltaTime: number;
  edgeCompliance: number;
  volumeCompliance: number;
}

const createReadOnlyStorageLayoutEntry = (
  index: number
): GPUBindGroupLayoutEntry => {
  return {
    binding: index,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: 'read-only-storage',
    },
  };
};

const createWritableStorageLayoutEntry = (
  index: number
): GPUBindGroupLayoutEntry => {
  return {
    binding: index,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: 'storage',
    },
  };
};

const createBindGroupBufferEntry = (
  index: number,
  buffer: GPUBuffer
): GPUBindGroupEntry => {
  return {
    binding: index,
    resource: {
      buffer,
    },
  };
};

export class SoftBodyMesh {
  // Per vertex information (corresponds to writableBindGroup)
  public numVertices: number;
  // Vec3 position, vec3 normal, vec2 uv
  public vertexBuffer: GPUBuffer;
  // Layout of vertex information in a renderPipeline
  public vertexBufferLayout: Iterable<GPUVertexBufferLayout>;
  // Vec3 prev_position buffer
  public prevPositionsBuffer: GPUBuffer;
  // Vec2 velocity buffer
  public velocitiesBuffer: GPUBuffer;
  // Bind Group for compute shader access to per vertex information
  private writableBindGroupLayout: GPUBindGroupLayout;
  private writableBindGroup: GPUBindGroup;

  // Triangle index information
  public indexCount: number;
  public indexBuffer: GPUBuffer;

  // Tetrahedron information
  // The number of tetrahedrons used within the mesh
  private numTets: number;
  // The number of tetrahedron edges in the mesh
  private numEdges: number;

  // read-only storage buffers
  // Ids of vertexes that form edges within a tetrahedron
  private tetEdgeIdsBuffer: GPUBuffer;
  // Ids of vertexes that form a tetrahedron volume
  private tetVolumeIdsBuffer: GPUBuffer;
  // Rest length of the tetrahedron edges
  private restEdgeLengthsBuffer: GPUBuffer;
  // Rest Volume of the mesh's tetrahedrons
  private restVolumeBuffer: GPUBuffer;
  // Inverse Mass of each tetrahedron vertex?
  private inverseMassBuffer: GPUBuffer;
  // read-only bind group
  private readOnlyBindGroupLayout: GPUBindGroupLayout;
  private readOnlyBindGroup: GPUBindGroup;

  // Uniforms Buffer
  uniformsBuffer: GPUBuffer;
  uniformBindGroupLayout: GPUBindGroupLayout;
  uniformBindGroup: GPUBindGroup;

  //Compute pipelines
  private preSolvePipeline: GPUComputePipeline;
  private solveEdgePipeline: GPUComputePipeline;
  private solveVolumePipeline: GPUComputePipeline;
  private postSolvePipeline: GPUComputePipeline;
  // Re-calc normals pipeline?
  // private calcNormalsPipeline: GPUComputePipeline

  private getTetrahedronEdgeLength = (
    positions: [number, number, number][],
    index: number,
    tetEdgeIds: [number, number][]
  ) => {
    // Get the indices of the two verts that make up our edge
    const edge = tetEdgeIds[index];
    // Get the initial positions of the verts based on those indices
    const edgeStartPos: Vec3 = positions[edge[0]];
    const edgeEndPos: Vec3 = positions[edge[1]];
    // Calculate the rest Length
    return Math.sqrt(vec3.distanceSq(edgeStartPos, edgeEndPos));
  };

  // The volume of a tetrahedron is not the same as the volume of a pyramid (i.e 1/3 * base area * height)
  // 1/3 * (1/2 * cross(vecA, vecB)) * vecD
  // https://www.youtube.com/watch?v=xDGsafxeujE
  private getTetrahedronVolume = (
    positions: [number, number, number][],
    index: number,
    tetVolumeIds: [number, number, number, number][]
  ) => {
    // Get vertices that make up the tetrahedron
    const vertex0 = positions[tetVolumeIds[index][0]];
    const vertex1 = positions[tetVolumeIds[index][1]];
    const vertex2 = positions[tetVolumeIds[index][2]];
    const vertex3 = positions[tetVolumeIds[index][3]];

    // Len 0 and len1 represents the lengths of the vectors that form the base of the tetrahedron
    const baseVectorA = vec3.sub(vertex1, vertex0);
    const baseVectorB = vec3.sub(vertex2, vertex0);
    // Vector going from base to tip of tetrahedron
    const baseToTipVectorD = vec3.sub(vertex3, vertex0);
    // Get vector that is perpendicular to the base of the tetrahedron
    const perpVectorC = vec3.cross(baseVectorA, baseVectorB);
    // Get volume by computing dot product of (A cross B) with D * 1/6
    return vec3.dot(perpVectorC, baseToTipVectorD) / 6.0;
  };

  private createReadOnlyStorageBindGroup(device: GPUDevice) {
    this.readOnlyBindGroupLayout = device.createBindGroupLayout({
      label: 'SoftBody.bindGroupLayout.readOnly',
      entries: [
        // Tetrahedron Edge Ids
        createReadOnlyStorageLayoutEntry(0),
        // Tetrahedron Edge Rest Lenghts
        createReadOnlyStorageLayoutEntry(1),
        // Tetrahedron Volume Ids
        createReadOnlyStorageLayoutEntry(2),
        // Tetrahedron Rest Volumes
        createReadOnlyStorageLayoutEntry(3),
        // Inverse Mass
        createReadOnlyStorageLayoutEntry(4),
      ],
    });

    this.readOnlyBindGroup = device.createBindGroup({
      label: 'SoftBody.bindGroup.readOnly',
      layout: this.readOnlyBindGroupLayout,
      entries: [
        createBindGroupBufferEntry(0, this.tetEdgeIdsBuffer),
        createBindGroupBufferEntry(1, this.restEdgeLengthsBuffer),
        createBindGroupBufferEntry(2, this.tetVolumeIdsBuffer),
        createBindGroupBufferEntry(3, this.restVolumeBuffer),
        createBindGroupBufferEntry(4, this.inverseMassBuffer),
      ],
    });
  }

  private createWriteStorageBindGroup(device: GPUDevice) {
    this.writableBindGroupLayout = device.createBindGroupLayout({
      label: 'SoftBody.bindGroupLayout.writable',
      entries: [
        // Vertices (pos, normal, uv)
        createWritableStorageLayoutEntry(0),
        // Prev Positions
        createWritableStorageLayoutEntry(1),
        // Velocities
        createWritableStorageLayoutEntry(2),
      ],
    });

    this.writableBindGroup = device.createBindGroup({
      label: 'SoftBody.bindGroup.writable',
      layout: this.writableBindGroupLayout,
      entries: [
        createBindGroupBufferEntry(0, this.vertexBuffer),
        createBindGroupBufferEntry(1, this.prevPositionsBuffer),
        createBindGroupBufferEntry(2, this.velocitiesBuffer),
      ],
    });
  }

  private createUniformBindGroup(device: GPUDevice) {
    // delta_time, edge_compliance, volume_compliance
    this.uniformsBuffer = device.createBuffer({
      label: 'SoftBody.unifromsBuffer',
      size: Float32Array.BYTES_PER_ELEMENT * 3,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // Bind Group Resources
    this.uniformBindGroupLayout = device.createBindGroupLayout({
      label: 'SoftBody.bindGroupLayout.uniforms',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: 'uniform',
          },
        },
      ],
    });
    this.uniformBindGroup = device.createBindGroup({
      label: 'SoftBody.bindGroup.uniforms',
      layout: this.uniformBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.uniformsBuffer,
          },
        },
      ],
    });
  }

  private createSoftBodyComputePipelines(device: GPUDevice) {
    const createSoftBodyComputePipeline = (
      code: string,
      entryPoint: string
    ) => {
      return device.createComputePipeline({
        label: `SoftBody.computePipeline.${entryPoint}`,
        compute: {
          module: device.createShaderModule({
            label: `Softbody.computeShader.${entryPoint}`,
            code: commonsWGSL + code,
          }),
          entryPoint,
        },
        layout: 'auto',
      });
    };
    this.preSolvePipeline = createSoftBodyComputePipeline(
      presolveWGSL,
      'preSolve'
    );
    this.solveEdgePipeline = createSoftBodyComputePipeline(
      solveEdgeWGSL,
      'solveEdge'
    );
    this.solveVolumePipeline = createSoftBodyComputePipeline(
      solveVolumeWGSL,
      'solveVolume'
    );
    this.postSolvePipeline = createSoftBodyComputePipeline(
      postSolveWGSL,
      'postSolve'
    );
  }

  constructor({ device, mesh }: SoftBodyMeshConstructorArgs) {
    // WRITABLE BIND GROUP RESOURCES
    // Create vertex buffers
    const vertexStride = 8;
    this.numVertices = mesh.positions.length;

    // Vertex buffer with per vertex info. Acts as both vertex buffer and storage compute buffer
    this.vertexBuffer = device.createBuffer({
      label: 'SoftBody.vertexBuffer',
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
    // Create a buffer that represents the vertices positions on the last frame
    this.prevPositionsBuffer = device.createBuffer({
      // Prev positions represented as a vec3 but accessed as f32s for vertex allignment
      label: 'SoftBody.storageBuffer.prevPostions',
      size: this.numVertices * Float32Array.BYTES_PER_ELEMENT * 3,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });

    //Create a buffer that represents the 3D velocities of each vertex
    this.velocitiesBuffer = device.createBuffer({
      label: 'SoftBody.storageBuffer.velocities',
      size: this.numVertices * Float32Array.BYTES_PER_ELEMENT * 3,
      usage: GPUBufferUsage.STORAGE,
    });

    // Create index buffers
    this.indexCount = mesh.triangles.length * 3;
    this.indexBuffer = device.createBuffer({
      label: 'SoftBody.indexBuffer',
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

    // each [number, number] in tetEdgeIds represents a single edge
    this.numEdges = mesh.tetEdgeIds.length;

    // Store the tetrahedron edge ids
    this.tetEdgeIdsBuffer = device.createBuffer({
      // Vec2f. 2 ids per edge for 2 vertices it is composed of
      label: 'SoftBody.storageBuffer.tetEdgeIds',
      size: this.numEdges * 2 * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });
    {
      const mapping = new Uint32Array(this.tetEdgeIdsBuffer.getMappedRange());
      // For each edge, set its vertex ids
      for (let i = 0; i < this.numEdges; i++) {
        mapping.set(mesh.tetEdgeIds[i], i * 2);
      }
      this.tetEdgeIdsBuffer.unmap();
    }

    // Store the lengths of each tetrahedron edge
    this.restEdgeLengthsBuffer = device.createBuffer({
      // One length per edge
      label: 'SoftBody.storageBuffer.restEdgeLengths',
      size: this.numEdges * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });
    {
      const mapping = new Float32Array(
        this.restEdgeLengthsBuffer.getMappedRange()
      );
      // For each edge
      for (let i = 0; i < this.numEdges; i++) {
        const restLength = this.getTetrahedronEdgeLength(
          mesh.positions,
          i,
          mesh.tetEdgeIds
        );
        mapping.set([restLength], i);
      }
      this.restEdgeLengthsBuffer.unmap();
    }

    // Each [num, num, num, num] in tetVolumeIds represents a signle tetrahedron volume
    this.numTets = mesh.tetVolumeIds.length;

    // Store the tetrahedron volume ids
    this.tetVolumeIdsBuffer = device.createBuffer({
      // Vec4: 4 vertices per tet
      label: 'SoftBody.storageBuffer.tetVolumeIds',
      size: Uint32Array.BYTES_PER_ELEMENT * 4 * this.numTets,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });
    {
      const mapping = new Uint32Array(this.tetVolumeIdsBuffer.getMappedRange());
      for (let i = 0; i < this.numTets; ++i) {
        mapping.set(mesh.tetVolumeIds[i], 4 * i);
      }
      this.tetVolumeIdsBuffer.unmap();
    }

    // Store the tetrahedron volumes and inverseMass
    this.restVolumeBuffer = device.createBuffer({
      label: 'SoftBody.storageBuffer.restVolume',
      size: Float32Array.BYTES_PER_ELEMENT * this.numTets,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });
    this.inverseMassBuffer = device.createBuffer({
      label: 'SoftBody.storageBuffer.inverseMass',
      // 4 masses for each tet, one mass per vertex
      size: Float32Array.BYTES_PER_ELEMENT * 4 * this.numTets,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });
    {
      const restVolMapping = new Float32Array(
        this.restVolumeBuffer.getMappedRange()
      );
      const inverseMassMapping = new Float32Array(
        this.inverseMassBuffer.getMappedRange()
      );
      for (let i = 0; i < this.numTets; i++) {
        // Set the mass of each tetrahedron
        const volume = this.getTetrahedronVolume(
          mesh.positions,
          i,
          mesh.tetVolumeIds
        );
        restVolMapping.set([volume], i);
        // Set the inverseMass of the vertices of the current tetrahedron
        const inverseMass = volume > 0.0 ? 1.0 / (volume / 4.0) : 0.0;
        const tetVertIdx = mesh.tetVolumeIds[i];
        // Individually set inverse mass of each vertex specified by the indices
        // provided by the tetrahedron (i.e we do not iterate set inverseMass by iterating
        // linearly through the buffer)
        inverseMassMapping.set([inverseMass], tetVertIdx[0]);
        inverseMassMapping.set([inverseMass], tetVertIdx[1]);
        inverseMassMapping.set([inverseMass], tetVertIdx[2]);
        inverseMassMapping.set([inverseMass], tetVertIdx[3]);
      }
      this.restVolumeBuffer.unmap();
      this.inverseMassBuffer.unmap();
    }

    this.createSoftBodyComputePipelines(device);
  }

  setup(device: GPUDevice, args: UniformArgs) {
    device.queue.writeBuffer(this.uniformsBuffer, 0, new Float32Array([args.deltaTime, args.edgeCompliance, args.volumeCompliance]));
  }

  private runComputePipeline = (
    commandEncoder: GPUCommandEncoder, 
    pipeline: GPUComputePipeline, 
    dispatches: number
  ) => {
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, this.writableBindGroup);
    passEncoder.setBindGroup(1, this.readOnlyBindGroup);
    passEncoder.setBindGroup(2, this.uniformBindGroup);
    passEncoder.dispatchWorkgroups(dispatches);
    passEncoder.end();
  }

  // Run the computePipelines
  run(commandEncoder: GPUCommandEncoder, workgroupSizeLimit: number) {
    // Calculate number of dispatches needed for each step of compute
    const preSolveDispatches = Math.ceil(this.numVertices / workgroupSizeLimit);
    const solveVolumeDispatches = Math.ceil(this.numTets / workgroupSizeLimit);
    const solveEdgesDispatches = Math.ceil(this.numEdges / workgroupSizeLimit);
    const postSolveDispatches = Math.ceil(
      this.numVertices / workgroupSizeLimit
    );

    // Pre solve, solve Edge, solve Volume, post solve
    this.runComputePipeline(commandEncoder, this.preSolvePipeline, preSolveDispatches);
    this.runComputePipeline(commandEncoder, this.solveEdgePipeline, solveEdgesDispatches);
    this.runComputePipeline(commandEncoder, this.solveVolumePipeline, solveVolumeDispatches);
    this.runComputePipeline(commandEncoder, this.postSolvePipeline, postSolveDispatches);

  }
}
