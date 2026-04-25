import { BindGroupCluster, Base2DRendererClass } from './utils';

import prefixSumDisplayWGSL from './prefixSumDisplay.frag.wgsl';

export default class PrefixSumDisplayRenderer extends Base2DRendererClass {
  switchBindGroup: (name: string) => void;
  computeBGDescript: BindGroupCluster;

  constructor(
    device: GPUDevice,
    presentationFormat: GPUTextureFormat,
    renderPassDescriptor: GPURenderPassDescriptor,
    computeBGDescript: BindGroupCluster,
    label: string
  ) {
    super();
    this.renderPassDescriptor = renderPassDescriptor;
    this.computeBGDescript = computeBGDescript;

    this.pipeline = super.create2DRenderPipeline(
      device,
      label,
      [this.computeBGDescript.bindGroupLayout],
      prefixSumDisplayWGSL,
      presentationFormat
    );
  }

  startRun(commandEncoder: GPUCommandEncoder) {
    super.executeRun(commandEncoder, this.renderPassDescriptor, this.pipeline, [
      this.computeBGDescript.bindGroups[0],
      this.currentBindGroup,
    ]);
  }
}
