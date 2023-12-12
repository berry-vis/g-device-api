import { DeviceContribution, Format, TextureUsage } from '../../src';

const width = 1000;
const height = 1000;

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
  useRAF = true,
) {
  // create swap chain and get device
  const swapChain = (await deviceContribution.createSwapChain($canvas))!;
  swapChain.configureSwapChain($canvas.width, $canvas.height);
  const device = swapChain.getDevice();

  const dataTexture = device.createTexture({
    format: Format.U8_LUMINANCE,
    width: 1,
    height: 1,
    usage: TextureUsage.SAMPLED,
    pixelStore: {
      unpackFlipY: false,
      packAlignment: 1,
    },
    mipLevelCount: 0,
  });
  dataTexture.setImageData([new Uint8Array([10])]);

  return () => {
    dataTexture.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

render.params = {
  targets: ['webgl1', 'webgl2', 'webgpu'],
  default: 'webgl2',
  width,
  height,
};