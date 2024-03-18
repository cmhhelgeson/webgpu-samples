// Vertex information
@group(0) @binding(0) var<storage, read_write> vertex_info: array<f32>;
// Prev positions
@group(0) @binding(1) var<storage, read_write> prev_positions: array<f32>;
// 3D Velocities
@group(0) @binding(2) var<storage, read_write> velocities: array<vec3f>;
// Inverse Mass
@group(1) @binding(4) var<storage, read> inverse_masses: array<vec4f>;
// Uniforms
@group(2) @binding(0) var<uniform> uniforms: Uniforms;


// Run for each vertex/particle
@compute @workgroup_size(64)
fn postSolve(
  @builtin(global_invocation_id) global_id : vec3u
) {
  if (inverse_masses[global_id.x] == 0.0) {
    continue;
  }

}