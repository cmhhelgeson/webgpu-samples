// Vertex Positions
@group(0) @binding(0) var<storage, read_write> vertex_info: array<f32>;
// Edge Info
@group(1) @binding(0) var<storage, read> edge_ids: array<vec2u>;
@group(1) @binding(1) var<storage, read> edge_lengths: array<f32>;

@group(1) @binding(4) var<storage, read> inverse_masses: array<?>
// Uniforms
@group(2) @binding(0) var<uniform> uniforms: Uniforms;


var<storage, read> edge_ids: array<vec2u>;
var<storage, read> inverse_mass: array<f32>;
var<storage, read> edge_lengths: array<f32>;


// Executed once per edge length
fn solveEdges() {
  let alpha = uniforms.edge_compliance / uniforms.delta_time / uniforms.delta_time;
  let edge = edge_ids[global_id.x];
  let w0 = this.inverse_mass[edge.x];
  let w1 = this.inverse_mass[edge.y];

  let w = w0 + w1;
  if (w == 0.0) {
    return;
  }

  let gradient = getVertexPosition(edge.x) - getVertexPosition(edge.y);
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
