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
  // Color output rgba
  @location(0) color : vec4<f32>,
  // Velocity output rgba16float
  @location(1) velocity : vec4<f32>,
}

@vertex
fn vert_main(
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
fn frag_main(input: VertexOutput) -> FragmentOutput {
  var output: FragmentOutput;
  var pos0 = (input.prevPosCS.xyz / input.prevPosCS.w);
  pos0 += 1.0;
  pos0 /= 2.0;

  var pos1 = (input.currPosCS.xyz / input.currPosCS.w);
  pos1 += 1.0;
  pos1 /= 2.0;

  output.color = textureSample(myTexture, mySampler, input.fragUV);
  let velocity = pos1 - pos0;
  output.velocity = vec4<f32>(velocity * 20, 1.0);
  return output;
}
