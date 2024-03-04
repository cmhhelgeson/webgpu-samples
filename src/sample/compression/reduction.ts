const ReductionComputeShader = (batch_size: number) => {

  const workgroupSize = batch_size / 2;
  return `

var<workgroup> local_data: array<u32, ${workgroupSize}>;

@group(0) @binding(0) var<storage, read> input_data: array<u32>;
@group(0) @binding(1) var<storage, read_write> reduced_array<u32>;

@compute @workgroup_size(${workgroupSize}, 1, 1)
fn computeMain(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>,
  @builtin(workgroup_id) workgroup_id: vec3<u32>,
) {
  local_data[local_id.x] = input_data[global_id.x * 2] + input_data[global_id.x * 2 + 1];

  workgroupBarrier();

  for (let i = )

}
`;