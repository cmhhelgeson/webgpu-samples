
struct Uniforms {
  data_size: u32,
}

@group(0) @binding(0) var<storage, read> input_data : array<u32>;
@group(0) @binding(1) var<storage, read_write> backward_mask: array<u32>;
@group(1) @binding(0) var<uniform> uniforms: Uniforms;


fn global_to_local_id(gid: u32) -> u32 {
  return gid % 256;
}

// https://github.com/austinEng/Project6-Vulkan-Flocking/blob/master/data/shaders/computeparticles/particle.comp
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
  backward_mask[global_id.x] = select(input_data[global_id.x] != input_data[global_id.x - 1], 1, global_id.x == 0)
}
