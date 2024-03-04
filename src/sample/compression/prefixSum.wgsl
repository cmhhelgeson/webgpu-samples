// https://betterprogramming.pub/efficient-parallel-prefix-sum-in-metal-for-apple-m1-9e60b974d62
// Use the article above as reference since WebGPU shares similar restrictions (to Metal) when it
// comes to workgroup synchronization.
// For the sake of this example, we will be employing the traditional three-phrase prefix sum algorithm
// 1. Upsweep
// 2. Scan in Place
// 3. Uniformly added back to the values per tile back down the tree