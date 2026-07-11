import {
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
  GLSL3,
  Scene,
  ShaderMaterial,
  Texture,
  WebGLRenderer,
  WebGLRenderTarget
} from "three";
import { createFullscreenTriangle, fullscreenCamera } from "./fullscreenTriangle";
import { accumulateFragmentShader, compositeFragmentShader, copyVertexShader } from "../shaders/post";

export class PostProcessor {
  private readonly scene = new Scene();
  private readonly quad;
  private readonly accumulateMaterial: ShaderMaterial;
  private readonly compositeMaterial: ShaderMaterial;
  private historyTarget: WebGLRenderTarget;
  private accumulatedTarget: WebGLRenderTarget;
  private hasHistory = false;

  constructor(width: number, height: number) {
    this.historyTarget = this.createTarget(width, height);
    this.accumulatedTarget = this.createTarget(width, height);
    this.accumulateMaterial = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: copyVertexShader,
      fragmentShader: accumulateFragmentShader,
      uniforms: {
        radianceTexture: { value: null },
        historyTexture: { value: this.historyTarget.texture },
        temporalMix: { value: 0 }
      },
      depthWrite: false,
      depthTest: false
    });
    this.compositeMaterial = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: copyVertexShader,
      fragmentShader: compositeFragmentShader,
      uniforms: {
        accumulatedTexture: { value: null },
        resolution: { value: [width, height] },
        exposure: { value: 1.1 },
        bloomStrength: { value: 0.16 }
      },
      depthWrite: false,
      depthTest: false
    });
    this.quad = createFullscreenTriangle(this.accumulateMaterial);
    this.scene.add(this.quad);
  }

  resize(width: number, height: number): void {
    this.historyTarget.dispose();
    this.accumulatedTarget.dispose();
    this.historyTarget = this.createTarget(width, height);
    this.accumulatedTarget = this.createTarget(width, height);
    this.compositeMaterial.uniforms.resolution.value = [width, height];
    this.hasHistory = false;
  }

  resetAccumulation(): void {
    this.hasHistory = false;
  }

  render(renderer: WebGLRenderer, radianceTexture: Texture, temporalMix: number): void {
    this.accumulateMaterial.uniforms.radianceTexture.value = radianceTexture;
    this.accumulateMaterial.uniforms.historyTexture.value = this.historyTarget.texture;
    this.accumulateMaterial.uniforms.temporalMix.value = this.hasHistory ? temporalMix : 0;

    this.quad.material = this.accumulateMaterial;
    renderer.setRenderTarget(this.accumulatedTarget);
    renderer.render(this.scene, fullscreenCamera);

    this.compositeMaterial.uniforms.accumulatedTexture.value = this.accumulatedTarget.texture;
    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, fullscreenCamera);

    const previousHistory = this.historyTarget;
    this.historyTarget = this.accumulatedTarget;
    this.accumulatedTarget = previousHistory;
    this.hasHistory = true;
  }

  private createTarget(width: number, height: number): WebGLRenderTarget {
    return new WebGLRenderTarget(width, height, {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      samples: 0
    });
  }
}
