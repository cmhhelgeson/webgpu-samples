@group(0) @binding(0) var<storage, read> data: array<f32>
@group(0) @binding(1) var<storage, write> outputTexture: texture_storage_2d<r32float, write>;

@compute @workgroup_size(196, 1, 1)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>)
) {
  
}