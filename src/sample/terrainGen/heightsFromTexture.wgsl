override WorkgroupSizeX: u32;
override WorkgroupSizeY: u32;
override CanvasWidth: u32;
override CanvasHeight: u32;


// NOTE: Redetermine what should be static overrides and what should be uniforms
struct TerrainUniforms {
  width: u32,
  depth: u32
}

@group(0) @binding(0) var input_heightmap: texture_2d<f32>;
@group(0) @binding(1) var<storage, write> output_heights: array<f32>;
@group(0) @binding(2) var<uniform> terrain_uniforms: TerrainUniforms;

//var<workgroup> scale_x: u32;
//var<workgroup> scale_y: u32;

@compute @workgroup_size(WorkgroupSizeX, WorkgroupSizeY)
fn heightsFromTexture(
  @builtin(local_invocation_id) local_id,
  @builtin(global_invocation_id) global_id
) -> {
  // Value will not persist past single workgroup, so need to rexecute on change over
  /*if (local_id.x == 0 && local_id.y == 0) {
    scale_x = CanvasWidth / (terrain_uniforms.width - 1);
    scale_y = CanvasHeight / (terrain_uniforms.depth - 1);
  }
  // Sync threads
  workgroupBarrier(); */

  // Presuming that we execute this compute shader per pixel of the texture,
  // local_id.x represents the row of our heightmap
  // local_id.y represents the col of our heightmap
  let img_x = floor(x * scale_x);
  let img_y = floor(z * scale_y);

  // Load value from pixel
  var height_value = textureLoad(input_heightmap, global_id.xy, 0);

  // Height normalization
  // Total rgb range is 255
  // 255 / 2 = 127.5
  // Range goes from (0, 255) -> (0, 2) -> (-1, 1)
  height_value = height_value / 127.5 - 1.0;
  output_heights[global_id.y * terrain_uniforms.width + global_id.x] = height_value;

}