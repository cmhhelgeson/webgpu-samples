// Static directional lighting
const lightDir = vec3f(1, 1, 1);
const dirColor = vec3(1);
const ambientColor = vec3f(0.05);

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let blue = vec3<f32>(0.0, 0.0, 255.0);
  let red = vec3<f32>(255.0, 0.0, 0.0)

  // Very simplified lighting algorithm.
  let lightColor = saturate(ambientColor + max(dot(input.normal, lightDir), 0.0) * dirColor);

  return vec4f(red.rgb * lightColor, 1.0);
}
