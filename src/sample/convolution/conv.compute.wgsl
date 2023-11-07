fn ACTIVATION_RELU(a: f32) -> f32 {
  return select(a, 0.0, a< 0.0);
}

fn ACTIVATION_SIGMOID(a: f32) -> f32 {
  return 1.0 / (1.0 + exp(-1.0 * a));
}

// Constants/enum
const RELU = 0;
const SIGMOID = 1;

struct Uniforms {
  activation_mode: u32,
}

fn convolutionComputeMain() -> {
  let a = 1.0;
  switch activation_mode {
    case RELU: 
      a = ACTIVATION_RELU(a);
      break;
    case SIGMOID:
      a = ACTIVATION_SIGMOID(a);
      break;
  }
}