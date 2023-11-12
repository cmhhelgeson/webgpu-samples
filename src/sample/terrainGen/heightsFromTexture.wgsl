struct TerrainUniforms {
  width: u32,
  depth: u32
}

@group(0) @binding(0) var input_heightmap: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> output_heights: array<f32>;
@group(0) @binding(2) var<uniform> terrain_uniforms: TerrainUniforms;

@compute @workgroup_size(16, 16, 1)
fn heightsFromTextureComputeMain(
  @builtin(global_invocation_id) global_id: vec3<u32>,
) {
  // Load value from pixel
  var height_value = textureLoad(input_heightmap, global_id.xy, 0);

  // Height normalization
  // Range goes from (0, 255) -> (0, 2) -> (-1, 1)
  output_heights[global_id.y * terrain_uniforms.width + global_id.x] = height_value.r / 127.5 - 1.0;
}