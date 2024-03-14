

fn setVertexNormal(vertex_index: u32, value: u32) 


// Run for each vertex
fn postSolve() {
  if (inverse_mass[global_id.x] == 0.0) {
    continue;
  }
  velocities[global_id.x] = (
    getVertexPosition(global_id.x) - prev_positions[global_id.x]
  ) * uniforms.delta_time;




}