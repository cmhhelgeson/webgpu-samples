import { Base2DRendererClass } from './utils';

import prefixSumDisplayWGSL from './prefixSumDisplay.frag.wgsl';

interface PrefixSumDisplayRendererOptions {
  device: GPUDevice;
  presentationFormat: GPUTextureFormat;
  renderPassDescriptor: GPURenderPassDescriptor;
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: GPUBindGroup;
  label: string;
}

export default class PrefixSumDisplayRenderer extends Base2DRendererClass {
  //switchBindGroup: (name: string) => void;
  bindGroup: GPUBindGroup;

  constructor({
    device,
    presentationFormat,
    renderPassDescriptor,
    bindGroup,
    bindGroupLayout,
    label,
  }: PrefixSumDisplayRendererOptions) {
    super();
    this.renderPassDescriptor = renderPassDescriptor;
    this.bindGroup = bindGroup;

    this.pipeline = super.create2DRenderPipeline(
      device,
      label,
      [bindGroupLayout],
      prefixSumDisplayWGSL,
      presentationFormat
    );
  }

  startRun(commandEncoder: GPUCommandEncoder) {
    super.executeRun(commandEncoder, this.renderPassDescriptor, this.pipeline, [
      this.bindGroup,
    ]);
  }
}
