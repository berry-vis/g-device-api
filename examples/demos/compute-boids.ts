import {
  DeviceContribution,
  VertexStepMode,
  Format,
  TransparentWhite,
  Buffer,
  Bindings,
  BufferUsage,
} from '../../src';
import { initExample } from './utils';

/**
 * Use Compute Shader with WebGPU
 * @see https://webgpu.github.io/webgpu-samples/samples/computeBoids#main.ts
 */

export async function render(
  deviceContribution: DeviceContribution,
  $canvas: HTMLCanvasElement,
  useRAF = true,
) {
  // create swap chain and get device
  const swapChain = await deviceContribution.createSwapChain($canvas);
  swapChain.configureSwapChain($canvas.width, $canvas.height);
  const device = swapChain.getDevice();

  const renderProgram = device.createProgram({
    vertex: {
      entryPoint: 'vert_main',
      wgsl: `
  struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(4) color : vec4<f32>,
  }

  @vertex
  fn vert_main(
    @location(0) a_particlePos : vec2<f32>,
    @location(1) a_particleVel : vec2<f32>,
    @location(2) a_pos : vec2<f32>
  ) -> VertexOutput {
    let angle = -atan2(a_particleVel.x, a_particleVel.y);
    let pos = vec2(
      (a_pos.x * cos(angle)) - (a_pos.y * sin(angle)),
      (a_pos.x * sin(angle)) + (a_pos.y * cos(angle))
    );

    var output : VertexOutput;
    output.position = vec4(pos + a_particlePos, 0.0, 1.0);
    output.color = vec4(
      1.0 - sin(angle + 1.0) - a_particleVel.y,
      pos.x * 100.0 - a_particleVel.y + 0.1,
      a_particleVel.x + cos(angle + 0.5),
      1.0);
    return output;
  }
  `,
    },
    fragment: {
      entryPoint: 'frag_main',
      wgsl: `
  @fragment
  fn frag_main(@location(4) color : vec4<f32>) -> @location(0) vec4<f32> {
    return color;
  }
  `,
    },
  });

  const computeProgram = device.createProgram({
    compute: {
      wgsl: `
struct Particle {
  pos : vec2<f32>,
  vel : vec2<f32>,
}
struct SimParams {
  deltaT : f32,
  rule1Distance : f32,
  rule2Distance : f32,
  rule3Distance : f32,
  rule1Scale : f32,
  rule2Scale : f32,
  rule3Scale : f32,
}
struct Particles {
  particles : array<Particle>,
}
@binding(0) @group(0) var<uniform> params : SimParams;
@binding(1) @group(0) var<storage, read> particlesA : Particles;
@binding(2) @group(0) var<storage, read_write> particlesB : Particles;

// https://github.com/austinEng/Project6-Vulkan-Flocking/blob/master/data/shaders/computeparticles/particle.comp
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var index = GlobalInvocationID.x;

  var vPos = particlesA.particles[index].pos;
  var vVel = particlesA.particles[index].vel;
  var cMass = vec2(0.0);
  var cVel = vec2(0.0);
  var colVel = vec2(0.0);
  var cMassCount = 0u;
  var cVelCount = 0u;
  var pos : vec2<f32>;
  var vel : vec2<f32>;

  for (var i = 0u; i < arrayLength(&particlesA.particles); i++) {
    if (i == index) {
      continue;
    }

    pos = particlesA.particles[i].pos.xy;
    vel = particlesA.particles[i].vel.xy;
    if (distance(pos, vPos) < params.rule1Distance) {
      cMass += pos;
      cMassCount++;
    }
    if (distance(pos, vPos) < params.rule2Distance) {
      colVel -= pos - vPos;
    }
    if (distance(pos, vPos) < params.rule3Distance) {
      cVel += vel;
      cVelCount++;
    }
  }
  if (cMassCount > 0) {
    cMass = (cMass / vec2(f32(cMassCount))) - vPos;
  }
  if (cVelCount > 0) {
    cVel /= f32(cVelCount);
  }
  vVel += (cMass * params.rule1Scale) + (colVel * params.rule2Scale) + (cVel * params.rule3Scale);

  // clamp velocity for a more pleasing simulation
  vVel = normalize(vVel) * clamp(length(vVel), 0.0, 0.1);
  // kinematic update
  vPos = vPos + (vVel * params.deltaT);
  // Wrap around boundary
  if (vPos.x < -1.0) {
    vPos.x = 1.0;
  }
  if (vPos.x > 1.0) {
    vPos.x = -1.0;
  }
  if (vPos.y < -1.0) {
    vPos.y = 1.0;
  }
  if (vPos.y > 1.0) {
    vPos.y = -1.0;
  }
  // Write back
  particlesB.particles[index].pos = vPos;
  particlesB.particles[index].vel = vVel;
}
`,
    },
  });

  const numParticles = 1500;
  const initialParticleData = new Float32Array(numParticles * 4);
  for (let i = 0; i < numParticles; ++i) {
    initialParticleData[4 * i + 0] = 2 * (Math.random() - 0.5);
    initialParticleData[4 * i + 1] = 2 * (Math.random() - 0.5);
    initialParticleData[4 * i + 2] = 2 * (Math.random() - 0.5) * 0.1;
    initialParticleData[4 * i + 3] = 2 * (Math.random() - 0.5) * 0.1;
  }

  const particleBuffers: Buffer[] = [];
  for (let i = 0; i < 2; ++i) {
    particleBuffers[i] = device.createBuffer({
      viewOrSize: initialParticleData,
      usage: BufferUsage.VERTEX | BufferUsage.STORAGE,
    });
  }

  const vertexBufferData = new Float32Array([
    -0.01, -0.02, 0.01, -0.02, 0.0, 0.02,
  ]);
  const spriteVertexBuffer = device.createBuffer({
    viewOrSize: vertexBufferData,
    usage: BufferUsage.VERTEX,
  });

  const uniformBuffer = device.createBuffer({
    viewOrSize: 7 * Float32Array.BYTES_PER_ELEMENT,
    usage: BufferUsage.UNIFORM,
  });

  const inputLayout = device.createInputLayout({
    vertexBufferDescriptors: [
      {
        byteStride: 4 * 4,
        stepMode: VertexStepMode.INSTANCE,
      },
      {
        byteStride: 4 * 2,
        stepMode: VertexStepMode.VERTEX,
      },
    ],
    vertexAttributeDescriptors: [
      {
        // instance position
        bufferIndex: 0,
        location: 0,
        bufferByteOffset: 0,
        format: Format.F32_RG,
      },
      {
        // instance velocity
        bufferIndex: 0,
        location: 1,
        bufferByteOffset: 4 * 2,
        format: Format.F32_RG,
      },
      {
        // vertex positions
        bufferIndex: 1,
        location: 2,
        bufferByteOffset: 0,
        format: Format.F32_RG,
      },
    ],
    indexBufferFormat: null,
    program: renderProgram,
  });

  const renderPipeline = device.createRenderPipeline({
    inputLayout,
    program: renderProgram,
    colorAttachmentFormats: [Format.U8_RGBA_RT],
  });
  const computePipeline = device.createComputePipeline({
    inputLayout: null,
    program: computeProgram,
  });

  const simParams = {
    deltaT: 0.04,
    rule1Distance: 0.1,
    rule2Distance: 0.025,
    rule3Distance: 0.025,
    rule1Scale: 0.02,
    rule2Scale: 0.05,
    rule3Scale: 0.005,
  };

  const bindings: Bindings[] = [];
  for (let i = 0; i < 2; ++i) {
    bindings[i] = device.createBindings({
      pipeline: computePipeline,
      uniformBufferBindings: [
        {
          binding: 0,
          buffer: uniformBuffer,
          size: 7 * Float32Array.BYTES_PER_ELEMENT,
        },
      ],
      storageBufferBindings: [
        {
          binding: 1,
          buffer: particleBuffers[i],
          size: initialParticleData.byteLength,
        },
        {
          binding: 2,
          buffer: particleBuffers[(i + 1) % 2],
          size: initialParticleData.byteLength,
        },
      ],
    });
  }

  const renderTarget = device.createRenderTarget({
    pixelFormat: Format.U8_RGBA_RT,
    width: $canvas.width,
    height: $canvas.height,
  });
  device.setResourceName(renderTarget, 'Main Render Target');

  uniformBuffer.setSubData(
    0,
    new Uint8Array(
      new Float32Array([
        simParams.deltaT,
        simParams.rule1Distance,
        simParams.rule2Distance,
        simParams.rule3Distance,
        simParams.rule1Scale,
        simParams.rule2Scale,
        simParams.rule3Scale,
      ]).buffer,
    ),
  );

  let id;
  let t = 0;
  const frame = () => {
    const computePass = device.createComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindings(bindings[t % 2]);
    computePass.dispatchWorkgroups(Math.ceil(numParticles / 64));
    device.submitPass(computePass);

    /**
     * An application should call getCurrentTexture() in the same task that renders to the canvas texture.
     * Otherwise, the texture could get destroyed by these steps before the application is finished rendering to it.
     */
    const onscreenTexture = swapChain.getOnscreenTexture();
    const renderPass = device.createRenderPass({
      colorAttachment: [renderTarget],
      colorResolveTo: [onscreenTexture],
      colorClearColor: [TransparentWhite],
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setVertexInput(
      inputLayout,
      [
        {
          buffer: particleBuffers[(t + 1) % 2],
        },
        {
          buffer: spriteVertexBuffer,
        },
      ],
      null,
    );
    renderPass.setViewport(0, 0, $canvas.width, $canvas.height);
    renderPass.draw(3, numParticles);

    device.submitPass(renderPass);
    ++t;
    id = requestAnimationFrame(frame);
  };

  frame();

  return () => {
    if (useRAF && id) {
      cancelAnimationFrame(id);
    }
    renderProgram.destroy();
    computeProgram.destroy();
    particleBuffers.forEach((buffer) => buffer.destroy());
    uniformBuffer.destroy();
    spriteVertexBuffer.destroy();
    inputLayout.destroy();
    renderPipeline.destroy();
    computePipeline.destroy();
    renderTarget.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

export async function ComputeBoids($container: HTMLDivElement) {
  return initExample($container, render, {
    targets: ['webgpu'],
    default: 'webgpu',
  });
}