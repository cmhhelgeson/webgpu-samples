struct Uniforms {
  prevModelViewMatrix: mat4x4<f32>,
  currentModelViewMatrix: mat4x4<f32>,
  prevModelViewProjectionMatrix: mat4x4<f32>,
  currentModelViewProjectionMatrix : mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) fragUV : vec2f,
}

@vertex
fn vertex_main(
  @location(0) position : vec4f,
  @location(1) uv : vec2f
) -> VertexOutput {
  // Get previous position of model and current position in viewSpace
  let prevPosVS = uniforms.prevModelViewMatrix * position;
  let currentPosVS = uniforms.currentModelViewMatrix * position;
  return VertexOutput(uniforms.modelViewProjectionMatrix * position, uv);
}

@fragment
fn fragment_main(@location(0) fragUV: vec2f) -> @location(0) vec4f {
  return textureSample(myTexture, mySampler, fragUV);
}
