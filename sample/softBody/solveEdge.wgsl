// Vertex Positions
@group(0) @binding(0) var<storage, read_write> vertex_info: array<f32>;
@group(0) @binding(1) var<storage, read_write> prev_positions: array<f32>;
// Edge Info
@group(1) @binding(0) var<storage, read> edge_ids: array<vec2u>;
@group(1) @binding(1) var<storage, read> edge_lengths: array<f32>;

// Masses 
@group(1) @binding(4) var<storage, read> inverse_masses: array<f32>;
// Uniforms
@group(2) @binding(0) var<uniform> uniforms: Uniforms;

// Run once per edge
@compute @workgroup_size(64)
fn solveEdge(
  @builtin(global_invocation_id) global_id : vec3u
) {
  if (global_id.x > uniforms.num_edges) {
    return;
  }

  let alpha = uniforms.edge_compliance / uniforms.delta_time / uniforms.delta_time;
  let edge = edge_ids[global_id.x];
  let w0 = inverse_masses[edge.x];
  let w1 = inverse_masses[edge.y];

  let w = w0 + w1;
  if (w == 0.0) {
    return;
  }

  var gradient = getVertexPosition(edge.x) - getVertexPosition(edge.y);
  let sqr_len = dot(gradient, gradient);
  let len = sqrt(sqr_len);
  if (len == 0.0) {
    return;
  }

  gradient /= len;
  let restLen = edge_lengths[global_id.x];
  let C = len - restLen;
  let s = -C / (w + alpha);
  setVertexPosition(edge.x, gradient + s * w0);
  setVertexPosition(edge.y, gradient + -s * w1);


}
