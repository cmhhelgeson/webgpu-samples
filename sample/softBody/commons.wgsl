struct Uniforms {
  delta_time: f32,
  edge_compliance: f32,
  volume_compliance: f32,
  num_verts: u32,
  num_edges: u32,
  num_tets: u32,
}

const GRAVITY = vec3f(0.0, 9.8, 0.0);

const VOLUME_ID_ORDER: array<vec3u, 4> = array<vec3u, 4>(
  vec3u(1, 3, 2),
  vec3u(0, 2, 3),
  vec3u(0, 3, 1),
  vec3u(0, 1, 2)
);

// Prev Positions are composed into vec3 from 3 byte elements
fn getPrevPosition(i: u32) -> vec3f {
  return vec3f(
    prev_positions[i * 3],
    prev_positions[i * 3 + 1],
    prev_positions[i * 3 + 2]
  );
}

fn setPrevPosition(i: u32, new_pos: vec3f) {
  prev_positions[i * 3] = new_pos.x;
  prev_positions[i * 3 + 1] = new_pos.y;
  prev_positions[i * 3 + 2] = new_pos.z;
}

// Vertex Positions are composed into vec3s from 8 byte vertex_info containing pos, normal, and uv
fn getVertexPosition(i: u32) -> vec3f {
  return vec3f(
    vertex_info[i * 8],
    vertex_info[i * 8 + 1],
    vertex_info[i * 8 + 2],
  );
}

fn setVertexPosition(i: u32, new_pos: vec3f) {
  vertex_info[i * 8] = new_pos.x;
  vertex_info[i * 8 + 1] = new_pos.y;
  vertex_info[i * 8 + 2] = new_pos.z;
}