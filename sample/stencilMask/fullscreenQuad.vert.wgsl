struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) fragUV : vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
  const pos = array(
    vec2( 1.0,  1.0),
    vec2(-1.0, -1.0),
    vec2(-1.0,  1.0),
    vec2( 1.0,  1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0, -1.0),
  );

  const uv = array(
    vec2( 1.0,  -1.0),
    vec2(-1.0, 1.0),
    vec2(-1.0,  -1.0),
    vec2( 1.0,  -1.0),
    vec2( 1.0, 1.0),
    vec2(-1.0, 1.0),
  );

  var output : VertexOutput;
  output.Position = vec4(pos[VertexIndex] / 1.5, 0.0, 1.0);
  output.fragUV = uv[VertexIndex];
  return output;
}
