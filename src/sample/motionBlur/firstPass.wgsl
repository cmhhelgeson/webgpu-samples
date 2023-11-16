struct Uniforms {
  prevVP: mat4x4<f32>,
  currVP: mat4x4<f32>,
  prevMVP: mat4x4<f32>,
  currMVP : mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) fragUV : vec2f,
  @location(1) prevPosCS: vec4f,
  @location(2) currPosCS: vec4f,
}

struct FragmentOutput {
  @location(0) color : vec4<f32>,
  @location(1) velocity : vec2<f32>,
}

@vertex
fn vertexMain(
  @location(0) position : vec4f,
  @location(1) normal : vec3f,
  @location(2) uv: vec2f,
) -> VertexOutput {
  var output: VertexOutput;
  output.currPosCS = uniforms.currMVP * position;
  output.prevPosCS = uniforms.prevMVP * position;
  output.Position = output.currPosCS;
  output.fragUV = uv;
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> FragmentOutput {
  var output: FragmentOutput;
  let a = (input.currPosCS.xy / input.currPosCS.w) * 0.5 + 0.5;
  let b = (input.prevPosCS.xy / input.prevPosCS.w) * 0.5 + 0.5;
  output.color = textureSample(myTexture, mySampler, input.fragUV);
  output.velocity = a - b;
  return output;
}
