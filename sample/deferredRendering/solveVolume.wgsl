// for each tet

var<storage, read> tet_volume_ids: array<vec4<u32>>;
var<storage, read> inverse_mass: array<f32>;

// Executed once per tetrahedron
fn solveVolumes() -> {
    var w = 0.0;
    let gradients: array<vec3f, 4> = [
        vec3f(0.0, 0.0, 0.0),
        vec3f(0.0, 0.0, 0.0),
        vec3f(0.0, 0.0, 0.0),
        vec3f(0.0, 0.0, 0.0)
    ];
    for (var i = 0; i < 4; i++) {
        let tet = tet_volume_ids[i];

        let vertex0 = tet[VOLUME_ID_ORDER[i][0]];
        let vertex1 = tet[VOLUME_ID_ORDER[i][1]];
        let vertex2 = tet[VOLUME_ID_ORDER[i][2]];

        let temp0 = getVertexPosition(vertex1) - getVertexPosition(vertex0);
        let temp1 = getVertexPosition(vertex2) - getVertexPosition(vertex0);

        gradients[j] = cross(temp1, temp0);
        gradients[j] /= 6.0;

        w += inverse_mass[tet[j]] * dot(gradients[j], gradients[j]);
    }

    if (w == 0.0) {
      continue;
    }
    let volume = getTetVolume(global_id.x);
    let restVolume = restVolumes[global_id.x];
    let C = volume - restVolume;
    var s = -C / (w + alpha);
    // Get the index of each vertex within this tetrahedron
    // Then add the gradient to it
    for (let i = 0; i < 4; i++) {
      // Get the
      let vertex_id = tet[i];
    }
}