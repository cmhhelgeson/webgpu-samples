struct SpaceUniforms {
  proj_matrix: mat4x4f,
  view_matrix: mat4x4f,
}

struct LightUniforms {
  light_pos_x: f32,
  light_pos_y: f32,
  light_pos_z: f32,
  light_intensity: f32,
  scaling_factor: f32,
}

struct VertexInput {
  // Shader assumes the missing 4th float is 1.0
  @location(0) position : vec4f,
}

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) posWS: vec3f,
}

fn inverseLerp(val: f32, minVal: f32, maxVal: f32) -> f32 {
  return (val - minVal) / (maxVal - minVal);
}

fn remap(
  val: f32,
  inputMin: f32,
  inputMax: f32,
  outputMin: f32,
  outputMax: f32,
) -> f32 {
  var t: f32 = inverseLerp(val, inputMin, inputMax);
  return mix(outputMin, outputMax, t);
}

// Uniforms
@group(0) @binding(0) var<uniform> space_uniforms : SpaceUniforms;
@group(0) @binding(1) var<uniform> light_uniforms: LightUniforms;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output : VertexOutput;
  // Create the View Projection Matrix
  let VP = space_uniforms.proj_matrix * space_uniforms.view_matrix;
  
  let posY = input.position.y * light_uniforms.scaling_factor;
  // Get Clip space transforms and pass through values out of the way
  output.Position = VP * vec4f(input.position.x, posY, input.position.z, input.position.w);
  output.posWS = input.position.xyz;

  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Get position, direction, and distance of light in tangent space (no need to multiply by model matrix as there is no model)
  //let normal = normalize(input.normal);
  //let lightDir = normalize(input.light_ws - input.pos_ws);
  let color = input.posWS.y / 200.0;
  return vec4f(vec3f(color), 1.0);
}