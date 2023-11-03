fn RELU(a: f32) -> f32 {
  return select(a, 0.0, a< 0.0);
}

fn SIGMOID(a: f32) -> f32 {
  return 1.0 / (1.0 + exp(-1.0 * a));
}