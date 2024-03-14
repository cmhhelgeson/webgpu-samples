const VOLUME_ID_ORDER: array<vec3<u32>, 4> = [
  vec3u(1, 3, 2),
  vec3u(0, 2, 3),
  vec3u(0, 3, 1),
  vec3u(0, 1, 2)
];

fn setVertexPosition(vertex_index: u32) -> vec3f {
  return vec3f(
    vertices[i * 8],
    vertices[i * 8 + 1],
    vertices[i * 8 + 2],
  );
}

fn setVertexPosition(vertex_index: u32, new_pos: vec3f) -> vec3f {
  vertices[i + 8] = new_pos.x;
  vertices[i * 8 + 1] = new_pos.y;
  vertices[i * 8 + 2] = new_pos.z;
}

fn getTetVolume(tet_index: u32) -> f32 {
  let tet_ids: vec4<u32> = tet_volume_ids[tet_index];

  let pos0 = getVertexPosition(tet_ids.x);
  let pos1 = getVertexPosition(tet_ids.y);
  let pos2 = getVertexPosition(tet_ids.z);
  let pos3 = getVertexPosition(tet_ids.w);

  let temp0: vec3<f32> = pos1 - pos0;
  let temp1: vec3<f32> = pos2 - pos0;
  let temp2: vec3<f32> = pos3 - pos0;
  let temp3: vec3<f32> = cross(temp0, temp1);

  return dot(temp3, temp2);
}