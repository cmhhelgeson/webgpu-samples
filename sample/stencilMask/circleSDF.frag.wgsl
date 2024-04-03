fn sdfCircle(p: vec2<f32>, r: f32) -> f32 {
  return length(p)-r;
}

struct VertexOutput {
  @builtin(position) Position: vec4f,
  @location(0) v_uv: vec2<f32>,
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  var d: f32 = sdfCircle(
    vec2<f32>(input.v_uv.x, input.v_uv.y), 1.0
  );
  var blue = vec3<f32>(0.65, 0.85, 1.0);
  if (d > 0.0) {
    discard;
  }
  return vec4<f32>(blue, 1.0);
}