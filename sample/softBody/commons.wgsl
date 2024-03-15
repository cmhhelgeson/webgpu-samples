struct Uniforms {
  delta_time: f32,
  edge_compliance: f32,
  volume_compliance: f32,
}

const VOLUME_ID_ORDER: array<vec3<u32>, 4> = [
  vec3u(1, 3, 2),
  vec3u(0, 2, 3),
  vec3u(0, 3, 1),
  vec3u(0, 1, 2)
];

// Prev Positions are composed into vec3 from 3 byte elements
fn getPrevPosition(index: u32) -> vec3f {
  return vec3f(
    prev_positions[i * 3],
    prev_positions[i * 3 + 1],
    prev_positions[i * 3 + 2]
  )
}

fn setPrevPosition(index: u32, new_pos: vec3f) {
  prev_positions[i * 3] = new_pos.x
  prev_positions[i * 3 + 1] = new_pos.y;
  prev_positions[i * 3 + 2] = new_pos.z;
}

// Vertex Positions are composed into vec3s from 8 byte vertices containing pos, normal, and uv
fn getVertexPosition(vertex_index: u32) -> vec3f {
  return vec3f(
    vertices[i * 8],
    vertices[i * 8 + 1],
    vertices[i * 8 + 2],
  );
}

fn setVertexPosition(vertex_index: u32, new_pos: vec3f) {
  vertices[i * 8] = new_pos.x;
  vertices[i * 8 + 1] = new_pos.y;
  vertices[i * 8 + 2] = new_pos.z;
}

// Calculates the volume of a tetrahedron
fn getTetVolume(tet_index: u32) -> f32 {
  let tet_ids: vec4u = tet_volume_ids[tet_index];

  // Get vertices that make up the tetrahedron
  let vertex0 = positions[tetVolumeIds[index][0]];
  let vertex1 = positions[tetVolumeIds[index][1]];
  let vertex2 = positions[tetVolumeIds[index][2]];
  let vertex3 = positions[tetVolumeIds[index][3]];

  // Len 0 and len1 represents the lengths of the vectors that form the base of the tetrahedron
  let base_vector_a = vertex1 - vertex0;
  let base_vector_b = vertex2 - vertex0; 
  // Vector going from base to tip of tetrahedron
  let base_to_tip_vector_d = vertex3 - vertex0;
  // Get vector that is perpendicular to the base of the tetrahedron
  let perp_vector_c = cross(base_vector_a, base_vector_b);
  // Get volume by computing dot product of (A cross B) with D * 1/6
  return dot(perp_vector_c, base_to_tip_vector_d) / 6.0;
}