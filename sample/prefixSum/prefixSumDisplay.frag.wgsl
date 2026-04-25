struct VertexOutput {
  @builtin(position) Position: vec4f,
  @location(0) fragUV: vec2f
}

// Uniforms from compute shader
@group(0) @binding(0) var<storage, read> data: array<u32>;

@fragment
fn frag_main(input: VertexOutput) -> @location(0) vec4f {
  var uv: vec2f = vec2f(
    input.fragUV.x * uniforms.width,
    input.fragUV.y * uniforms.height
  );

  var pixel: vec2u = vec2u(
    u32(floor(uv.x)),
    u32(floor(uv.y)),
  );

  var elementIndex = u32(uniforms.width) * pixel.y + pixel.x;
  var colorChanger = data[elementIndex];

  var subtracter = f32(colorChanger) / (uniforms.width * uniforms.height);

  var color: vec3f = vec3f(
    1.0 - subtracter
  );

  return vec4f(color.rgb, 1.0);
}
