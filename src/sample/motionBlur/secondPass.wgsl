struct Uniforms {
  velocity_scale: f32,
  velocity_samples: u32,
}


@group(0) @binding(0) var texture_color: texture_2d<f32>;
@group(0) @binding(1) var texture_velocity: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn fragmentMain(
  @builtin(position) coord : vec4<f32>
) -> @location(0) vec4<f32> {
  var color_result : vec4<f32>;
  color_result = textureLoad(
    texture_color,
    vec2<i32>(floor(coord.xy)),
    0
  );

  let dims = textureDimensions(texture_color);
  let texelSize = vec2<f32>(1.0 / f32(dims.x), 1.0 / f32(dims.y));
  let screenTexCoords: vec2<f32> = coord.xy * texelSize;
  var velocity = textureLoad(texture_velocity, vec2<i32>(floor(screenTexCoords.xy)), 0).rg;
  velocity *= uniforms.velocity_scale;

  for (var i: u32 = 1; i < uniforms.velocity_samples; i++) {
    let offset = velocity * (f32(i) / f32(uniforms.velocity_samples - 1) - 0.5);
    let newCoord = screenTexCoords + offset;
    color_result += textureLoad(
      texture_color, 
      vec2<i32>(floor(newCoord.xy)), 
      0
    );
   }
   color_result /= f32(uniforms.velocity_samples);
  return color_result;
}
