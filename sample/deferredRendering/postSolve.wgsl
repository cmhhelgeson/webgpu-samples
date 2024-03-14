@group(0) @binding(0) var<storage, read_write> vertex_info: array<f32>;
@group(0) @binding(1) var<storage, read_write> prev_positions: array<f32>;
@group(0)
// Edge Info
@group(1) @binding(0) var<storage, read> edge_ids: array<vec2u>;
@group(1) @binding(1) var<storage, read> edge_lengths: array<f32>;

@group(1) @binding(4) var<storage, read> inverse_masses: array<?>
// Uniforms
@group(2) @binding(0) var<uniform> uniforms: Uniforms;


// Run for each vertex/particle
fn postSolve() {
  if (inverse_masses[global_id.x] == 0.0) {
    continue;
  }
  velocities[global_id.x] = (
    getVertexPosition(global_id.x) - prev_positions[global_id.x]
  ) * uniforms.delta_time;




}