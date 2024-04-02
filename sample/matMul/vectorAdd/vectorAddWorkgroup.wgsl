// Arbitrary shader using var<workgroup> for little benefit to test Interface API

@group(0) @binding(0) var<storage, read> vector_a: array<f32>;
@group(0) @binding(1) var<storage, read> vector_b: array<f32>;
@group(0) @binding(2) var<storage, read_write> vector_c: array<f32>;

var<workgroup> local_data: array<u32, 128>;
@compute @workgroup_size(64, 1, 1)
fn computeMain(  
  @builtin(global_invocation_id) global_id: vec3u,
  @builtin(local_invocation_id) local_id: vec3u,
) -> {
  local_data[local_id.x] = vector_a[global_id.x];
  local_data[local_id.x + 64] = vector_b[global_id.x];
  workgroupBarrier();
  // vector c            =  vector a  data        +  vector b data
  vector_c[global_id.x] = local_data[local_id.x] + local_data[local_id.x + 64];
}
