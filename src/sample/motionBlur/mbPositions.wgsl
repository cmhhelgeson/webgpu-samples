struct VertexInput {
  @location(0) position: vec4f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) fragUV : vec2f,
}

struct FragmentOutput {
  @location(0) current_color: vec4f,
  @location(1) prev_color: vec4f,
}

struct Uniforms {
  prevMV: mat4x4<f32>,
  currMV: mat4x4<f32>,
  prevMVP: mat4x4<f32>,
  currMVP : mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var myTexture: texture_2d<f32>;
@group(0) @binding(2) var mySampler: sampler;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  // Get positions and normals in view space
  let prevPosVS = uniforms.prevMV * input.position;
  let currentPosVS = uniforms.currMV * input.position;
  let normalVS = (uniforms.currMV * vec4f(input.normal, 1.0)).xyz;

  // Calculate motion vector in view space (movement of pixels)
  let motionVectorVS = currentPosVS.xyz - prevPosVS.xyz;

  // Calculate positions in clip space (mv -> mvp)
  let prevPosCS = uniforms.prevMVP * input.position;
  let currPosCS = uniforms.currMVP * input.position;

  // Blur often fails at edges of object silhoutte, since pixels outside object
  // edge necessarily have a velocity of 0. So we extend the vertices of an object
  // along the direction of motion.
  output.Position = select(
    prevPosCS, 
    currPosCS, 
    dot(motionVectorVS, normalVS) > 0
  );
  output.fragUV = input.uv;
  return output;
}

@fragment
fn fragmentMain(@location(0) fragUV: vec2f) -> @location(0) vec4f {
  return textureSample(myTexture, mySampler, fragUV);
}
