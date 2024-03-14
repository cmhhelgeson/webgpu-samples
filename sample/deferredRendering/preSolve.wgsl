
// Alligned to eight vec3 pos, vec3 normal, vec3 uv
@group(0) @binding(0) var<storage, read_write> vertex_info: array<f32>;
// vec3<f32s> positions we read in as f32s to prevent allignment issues
@group(0) @binding(1) var<storage, read_write> prev_positions: array<f32>;
@group(0) @binding(2) var<storage, read_write> velocites: array<vec2f>;
// delta_time, edge_compliance, volume_compliance
@group(2) @binding(0) var<uniform> uniforms: Uniforms;

vecAdd(velocities, i, gravity, 0, dt)

velocities[i * 3] = gravity[0] * deltaTime
velocities[i * 3 + 1] = gravity[1] * deltaTime
velocities[i * 3 + 2] = gravity[2] * deltaTime


// Executed once per vertex
fn presolve() -> {
  //Apply gravity to current velocity
  let current_velocity = &velocities[global_id.x];
  (*current_velocity).y += gravity.y * uniforms.delta_time;
  // Set previous positions to current_position
  let pos_x = &vertices[global_id.x * 8];
  let pos_y = &vertices[global_id.x * 8 + 1];
  let pos_z = &vertices[global_id.x * 8 + 2];
  prev_positions[global_id.x] = vec4f((*pos_x),(*pos_y),(*pos_z), 1.0);

  // Add new velocity to current position
  (*pos_x) += (*current_velocity).x * uniforms.delta_time;
  (*pos_y) += (*current_velocity).y * uniforms.delta_time;
  (*pos_z) += (*current_velocity).z * uniforms.delta_time;

  // If our y position is less than the value of the floor
  if ((*pos_y) < 0.0) {
    // Set our current position to the most recent previous position
    // that did not intersect the floor
    (*pos_x) = prev_positions[global_id.x].x
    (*pos_y) = prev_positions[global_id.x].y
    (*pos_z) = prev_positions[global_id.x].z
  }
}