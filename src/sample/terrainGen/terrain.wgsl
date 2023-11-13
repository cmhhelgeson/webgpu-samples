struct SpaceUniforms {
  proj_matrix: mat4x4f,
  view_matrix: mat4x4f,
}

struct LightUniforms {
  light_pos_x: f32,
  light_pos_y: f32,
  light_pos_z: f32,
  light_intensity: f32,
}

struct VertexInput {
  // Shader assumes the missing 4th float is 1.0
  @location(0) position : vec4f,
}

struct VertexOutput {
  @builtin(position) Position : vec4f,
}

// Uniforms
@group(0) @binding(0) var<uniform> space_uniforms : SpaceUniforms;
@group(0) @binding(1) var<uniform> light_uniforms: LightUniforms;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output : VertexOutput;
  // Create the View Projection Matrix
  let VP = space_uniforms.proj_matrix * space_uniforms.view_matrix;
  
  // Get Clip space transforms and pass through values out of the way
  output.Position = VP * input.position;

  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Get position, direction, and distance of light in tangent space (no need to multiply by model matrix as there is no model)
  //let normal = normalize(input.normal);
  //let lightDir = normalize(input.light_ws - input.pos_ws);
  //let diffuseLight = max(dot(normal, lightDir), 0.0) * vec3f(255.0, 255.0, 255.0);
  return vec4f(35.0, 255.0, 255.0, 1.0);
}