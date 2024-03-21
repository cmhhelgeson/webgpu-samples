
// Alligned to eight vec3 pos, vec3 normal, vec3 uv
@group(0) @binding(0) var<storage, read_write> vertex_info: array<f32>;
// vec3<f32s> positions we read in as f32s to prevent allignment issues
@group(0) @binding(1) var<storage, read_write> prev_positions: array<f32>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec3f>;
// delta_time, edge_compliance, volume_compliance
@group(2) @binding(0) var<uniform> uniforms: Uniforms;

// NOTE: POSITION AND PREV POSITION HAVE TO BE SET WITH COMMONS.WGSL FUNCTIONS
// IN ORDER FOR THEM TO BE SET AND PARSED CORRECTLY.

// Executed once per vertex
@compute @workgroup_size(64)
fn preSolve(
  @builtin(global_invocation_id) global_id : vec3u
) {
  if (global_id.x > uniforms.num_verts) {
    return;
  }

  //Apply gravity to current velocity
  let current_velocity = &velocities[global_id.x];
  (*current_velocity).y += GRAVITY.y * uniforms.delta_time;

  // Set previous position to current_position
  setPrevPosition(global_id.x, getVertexPosition(global_id.x));
  // Add new velocity to current position
  setVertexPosition(global_id.x, velocities[global_id.x] * uniforms.delta_time);

  // If our y position is less than the value of the floor
  let new_position = getVertexPosition(global_id.x);
  if (new_position.y < 0.0) {
    // Set our current position to the most recent previous position
    // that did not intersect the floor
    setVertexPosition(global_id.x, getPrevPosition(global_id.x));
  }
}