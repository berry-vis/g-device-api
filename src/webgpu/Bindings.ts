import type { Bindings, BindingsDescriptor } from '../api';
import {
  getFormatSamplerKind,
  ResourceType,
  assert,
  defaultBindingLayoutSamplerDescriptor,
} from '../api';
import { getPlatformBuffer, getPlatformSampler } from './utils';
import type { BindGroupLayout, IDevice_WebGPU } from './interfaces';
import { ResourceBase_WebGPU } from './ResourceBase';
import type { Texture_WebGPU } from './Texture';
import { ComputePipeline_WebGPU } from './ComputePipeline';

export class Bindings_WebGPU extends ResourceBase_WebGPU implements Bindings {
  type: ResourceType.Bindings = ResourceType.Bindings;

  gpuBindGroup: GPUBindGroup[];
  bindGroupLayout: BindGroupLayout;
  numUniformBuffers: number;

  constructor({
    id,
    device,
    descriptor,
  }: {
    id: number;
    device: IDevice_WebGPU;
    descriptor: BindingsDescriptor;
  }) {
    super({ id, device });

    const { pipeline } = descriptor;
    assert(!!pipeline);

    const {
      uniformBufferBindings,
      storageBufferBindings,
      samplerBindings,
      storageTextureBindings,
    } = descriptor;
    this.numUniformBuffers = uniformBufferBindings?.length || 0;

    // entries orders: Storage(read-only storage) Uniform Sampler
    const gpuBindGroupEntries: GPUBindGroupEntry[][] = [[], [], []];
    let numBindings = 0;

    if (storageBufferBindings && storageBufferBindings.length) {
      for (let i = 0; i < storageBufferBindings.length; i++) {
        const { binding, size, offset, buffer } =
          descriptor.storageBufferBindings[i];
        const gpuBufferBinding: GPUBufferBinding = {
          buffer: getPlatformBuffer(buffer),
          offset: offset ?? 0,
          size,
        };
        gpuBindGroupEntries[0].push({
          binding: binding ?? numBindings++,
          resource: gpuBufferBinding,
        });
      }
    }

    if (uniformBufferBindings && uniformBufferBindings.length) {
      for (let i = 0; i < uniformBufferBindings.length; i++) {
        const { binding, size, offset, buffer } =
          descriptor.uniformBufferBindings[i];
        const gpuBufferBinding: GPUBufferBinding = {
          buffer: getPlatformBuffer(buffer),
          offset: offset ?? 0,
          size,
        };
        gpuBindGroupEntries[0].push({
          binding: binding ?? numBindings++,
          resource: gpuBufferBinding,
        });
      }
    }

    if (samplerBindings && samplerBindings.length) {
      numBindings = 0;
      for (let i = 0; i < samplerBindings.length; i++) {
        const samplerEntry = {
          ...samplerBindings[i],
          ...defaultBindingLayoutSamplerDescriptor,
        };

        const binding = descriptor.samplerBindings[i];
        const texture =
          binding.texture !== null
            ? binding.texture
            : this.device['getFallbackTexture'](samplerEntry);

        samplerEntry.dimension = (texture as Texture_WebGPU).dimension;
        samplerEntry.formatKind = getFormatSamplerKind(
          (texture as Texture_WebGPU).format,
        );

        const gpuTextureView = (texture as Texture_WebGPU).gpuTextureView;
        gpuBindGroupEntries[1].push({
          binding: numBindings++,
          resource: gpuTextureView,
        });

        const sampler =
          binding.sampler !== null
            ? binding.sampler
            : this.device['getFallbackSampler'](samplerEntry);
        const gpuSampler = getPlatformSampler(sampler);
        gpuBindGroupEntries[1].push({
          binding: numBindings++,
          resource: gpuSampler,
        });
      }
    }

    if (storageTextureBindings && storageTextureBindings.length) {
      numBindings = 0;
      for (let i = 0; i < storageTextureBindings.length; i++) {
        const binding = descriptor.storageTextureBindings[i];
        const texture = binding.texture;

        const gpuTextureView = (texture as Texture_WebGPU).gpuTextureView;
        gpuBindGroupEntries[2].push({
          binding: numBindings++,
          resource: gpuTextureView,
        });
      }
    }

    this.gpuBindGroup = gpuBindGroupEntries
      .filter((entries) => entries.length > 0)
      .map((gpuBindGroupEntries, i) =>
        this.device.device.createBindGroup({
          // layout: bindGroupLayout.gpuBindGroupLayout[i],
          layout: (pipeline as ComputePipeline_WebGPU).getBindGroupLayout(i),
          entries: gpuBindGroupEntries,
        }),
      );
  }
}
