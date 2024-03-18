@group(0) @binding(0) var<storage, read_write> vertex_info: array<f32>;
@group(0) @binding(1) var<storage, read_write> prev_positions: array<f32>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec2f>;

@group(1) @binding(4) var<storage, read> inverse_masses: array<f32>;
// Uniforms
@group(2) @binding(0) var<uniform> uniforms: Uniforms;


// Run for each vertex/particle
@compute @workgroup_size(64)
fn postSolve(
  @builtin(global_invocation_id) global_id : vec3u
) {
  if (inverse_masses[global_id.x] == 0.0) {
    return;
  }
  velocities[global_id.x] = (
    getVertexPosition(global_id.x) - prev_positions[global_id.x]
  ) * uniforms.delta_time;

  // Do something with normals?
}