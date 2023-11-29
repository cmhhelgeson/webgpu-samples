struct Uniforms {
  velocity_scale: f32,
  velocity_samples: u32,
}

@group(0) @binding(0) var texture_color: texture_2d<f32>;
@group(0) @binding(1) var texture_velocity: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@group(0) @binding(3) var texture_sampler: sampler;

struct FragmentInput {
  @builtin(position) coord: vec4<f32>,
  @location(0) fragUV: vec2<f32>,
}

@fragment
fn frag_main(input: FragmentInput) -> @location(0) vec4<f32> {
  var color_result : vec4<f32>;
  let velocity = textureLoad(
    texture_velocity,
    vec2<i32>(floor(input.coord.xy)),
    0
  ).xy;

  let mod_x = (input.coord.x + input.coord.y) * 0.25;
  let mod_y = 1.0;
  let jitter = mod_x - mod_y * floor(mod_x / mod_y);

  let jitter_offset = jitter * velocity * vec2<f32>(jitter) / f32(uniforms.velocity_samples);

  var start_uv = input.fragUV - velocity * 0.5 + jitter_offset;
  start_uv = vec2<f32>(clamp(start_uv.x, 0.0, 1.0), clamp(start_uv.y, 0.0, 1.0));

  var end_uv = input.fragUV + velocity * 0.5 + jitter_offset;
  end_uv = vec2<f32>(clamp(end_uv.x, 0.0, 1.0), clamp(end_uv.y, 0.0, 1.0));

  for (var i: u32 = 0; i < uniforms.velocity_samples; i++) {
    let sample_uv = mix(start_uv, end_uv, f32(i) / f32(uniforms.velocity_samples));
    color_result += textureSample(texture_color, texture_sampler, input.fragUV);
  }
  color_result /= f32(uniforms.velocity_samples);
  return color_result;
}
