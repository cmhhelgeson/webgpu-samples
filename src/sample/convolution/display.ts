import { BindGroupCluster, Base2DRendererClass } from './utils';
import display from './display.frag.wgsl';

export default class DisplayRenderer extends Base2DRendererClass {
  static sourceInfo = {
    name: __filename.substring(__dirname.length + 1),
    contents: __SOURCE__,
  };

  switchBindGroup: (name: string) => void;
  bgCluster: BindGroupCluster;

  constructor(
    device: GPUDevice,
    presentationFormat: GPUTextureFormat,
    renderPassDescriptor: GPURenderPassDescriptor,
    bgCluster: BindGroupCluster,
    label: string
  ) {
    super();
    this.renderPassDescriptor = renderPassDescriptor;
    this.bgCluster = bgCluster;

    this.pipeline = super.create2DRenderPipeline(
      device,
      label,
      [this.bgCluster.bindGroupLayout],
      display,
      presentationFormat
    );
  }

  startRun(commandEncoder: GPUCommandEncoder) {
    super.executeRun(commandEncoder, this.renderPassDescriptor, this.pipeline, [
      this.bgCluster.bindGroups[0],
    ]);
  }
}
