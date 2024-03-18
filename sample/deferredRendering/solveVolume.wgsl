// Vertex Info
@group(0) @binding(0) var<storage, read_write> vertex_info: array<f32>;
// Prev Positions
@group(0) @binding(1) var<storage, read_write> prev_positions: array<f32>;
// Volume Info
@group(1) @binding(2) var<storage, read> tet_volume_ids: array<vec4u>;
@group(1) @binding(3) var<storage, read> rest_volumes: array<f32>;

@group(1) @binding(4) var<storage, read> inverse_masses: array<f32>;
// Uniforms
@group(2) @binding(0) var<uniform> uniforms: Uniforms;

// Calculates the volume of a tetrahedron
fn getTetVolume(index: u32) -> f32 {
  // Get vec3f vertex positions that make up the tetrahedron
  let vertex0 = getVertexPosition(tet_volume_ids[index][0]);
  let vertex1 = getVertexPosition(tet_volume_ids[index][1]);
  let vertex2 = getVertexPosition(tet_volume_ids[index][2]);
  let vertex3 = getVertexPosition(tet_volume_ids[index][3]);

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

// Run once per tetrahedron
@compute @workgroup_size(64)
fn solveVolume(
  @builtin(global_invocation_id) global_id : vec3u
) {
    var w = 0.0;
    var alpha = uniforms.volume_compliance / uniforms.delta_time / uniforms.delta_time;
    var gradients: array<vec3f, 4> = array<vec3f, 4>(
        vec3f(0.0, 0.0, 0.0),
        vec3f(0.0, 0.0, 0.0),
        vec3f(0.0, 0.0, 0.0),
        vec3f(0.0, 0.0, 0.0)
    );
    for (var i = 0; i < 4; i++) {
        let tet = tet_volume_ids[i];

        let vertex0 = tet[VOLUME_ID_ORDER[i][0]];
        let vertex1 = tet[VOLUME_ID_ORDER[i][1]];
        let vertex2 = tet[VOLUME_ID_ORDER[i][2]];

        let temp0 = getVertexPosition(vertex1) - getVertexPosition(vertex0);
        let temp1 = getVertexPosition(vertex2) - getVertexPosition(vertex0);

        gradients[i] = cross(temp1, temp0);
        gradients[i] /= 6.0;

        w += inverse_masses[tet[i]] * dot(gradients[i], gradients[i]);
    }

    if (w == 0.0) {
      return;
    }
    let volume = getTetVolume(global_id.x);
    let rest_volume = rest_volumes[global_id.x];
    let C = volume - rest_volume;
    var s = -C / (w + alpha);
    // Get the index of each vertex within this tetrahedron
    // Then add the gradient to it
    for (var i = 0; i < 4; i++) {
      // Get the
      let vertex_id = tet_volume_ids[global_id.x][i];
      setVertexPosition(vertex_id, gradients[i] + s * inverse_masses[vertex_id]);
    }
}