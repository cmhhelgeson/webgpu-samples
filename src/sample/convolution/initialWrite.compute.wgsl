@group(0) @binding(0) var<storage, read> data: array<f32>
@group(0) @binding(1) var<storage, write> outputTexture: texture_storage_2d<r32float, write>;


// We will dispatch 7 workgroups
@compute @workgroup_size(4, 4, 1)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>)
) {
  let x_index = global_id.x;
  let y_index = global_id.y;
  let index: u32 = y_index * 28 + global_id.x;
  textureStore(outputTexture, vec2<x_index, y_index>, vec4<f32>(data[index], 0.0, 0.0, 1.0));
}