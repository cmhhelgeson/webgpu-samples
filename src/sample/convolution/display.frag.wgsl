struct VertexOutput {
  @builtin(position) Position: vec4<f32>,
  @location(0) fragUV: vec2<f32>
}

// Uniforms from compute shader
@group(0) @binding(0) var input_texture: texture_2d<f32>;

@fragment
fn frag_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let coords: vec2<i32> = vec2<i32>(input.Position.xy);
  let value: f32 = textureLoad(input_texture, coords, 0).r;
  return vec4<f32>(value, value, value, 1.0);
}