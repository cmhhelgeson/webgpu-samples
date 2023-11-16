@group(0) @binding(0) var texture_color: texture_2d<f32>;
@group(0) @binding(1) var texture_velocity: texture_2d<f32>;

@fragment
fn fragmentMain(
  @builtin(position) coord : vec4<f32>
) -> @location(0) vec4<f32> {
  var result : vec4<f32>;
  result = textureLoad(
    texture_color,
    vec2<i32>(floor(coord.xy)),
    0
  );
  return result;
}
