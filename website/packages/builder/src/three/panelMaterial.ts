import { Matrix3, MeshStandardMaterial, type Texture, type WebGLProgramParametersWithUniforms } from 'three';

export interface PanelUniforms {
  /** Eased zip line position, 0 = old art everywhere, 1 = new art everywhere (builder.md 5.7). */
  uProgress: { value: number };
  /** Zip line opacity during the swap. */
  uLine: { value: number };
  /** Outward pop along the normal in metres. */
  uPop: { value: number };
  uMapOld: { value: Texture | null };
  uMapNew: { value: Texture | null };
  /** Per-texture UV transform (cover-crop). */
  uMatOld: { value: Matrix3 };
  uMatNew: { value: Matrix3 };
}

export function createPanelUniforms(): PanelUniforms {
  return {
    uProgress: { value: 0 },
    uLine: { value: 0 },
    uPop: { value: 0 },
    uMapOld: { value: null },
    uMapNew: { value: null },
    uMatOld: { value: new Matrix3() },
    uMatNew: { value: new Matrix3() },
  };
}

const VERT_COMMON = /* glsl */ `
#include <common>
varying vec2 vPanelUv;
uniform float uPop;
`;

const VERT_BEGIN = /* glsl */ `
#include <begin_vertex>
vPanelUv = uv;
transformed += normal * uPop;
`;

const FRAG_COMMON = /* glsl */ `
#include <common>
varying vec2 vPanelUv;
uniform sampler2D uMapOld;
uniform sampler2D uMapNew;
uniform mat3 uMatOld;
uniform mat3 uMatNew;
uniform float uProgress;
uniform float uLine;
`;

/**
 * Two samplers and one progress uniform. glTF convention: vUv.y = 0 is the TOP of the artwork, so the wipe runs
 * top to bottom: above the line the new art, below the old art. Within 0.006 of the line a 2-tone tooth pattern
 * (#111111, `step(0.5, fract(uv.x * 40.0))`).
 */
const FRAG_MAP = /* glsl */ `
vec2 uvOld = (uMatOld * vec3(vPanelUv, 1.0)).xy;
vec2 uvNew = (uMatNew * vec3(vPanelUv, 1.0)).xy;
vec4 texOld = texture2D(uMapOld, uvOld);
vec4 texNew = texture2D(uMapNew, uvNew);
float isNew = 1.0 - step(uProgress, vPanelUv.y);
diffuseColor *= mix(texOld, texNew, isNew);
float zipBand = (1.0 - step(0.006, abs(vPanelUv.y - uProgress))) * uLine;
float zipTooth = step(0.5, fract(vPanelUv.x * 40.0));
vec3 zipColor = mix(vec3(0.0056), vec3(0.045), zipTooth);
diffuseColor.rgb = mix(diffuseColor.rgb, zipColor, zipBand);
`;

export interface SwapPanelMaterial {
  material: MeshStandardMaterial;
  uniforms: PanelUniforms;
}

/**
 * The panel material: a MeshStandardMaterial (roughness 0.9, metalness 0, never tinted) whose shader is patched with
 * `onBeforeCompile`. `onPatchFailed` is called synchronously when a required include is missing from the stock
 * shader; compile errors are reported by the renderer's `debug.onShaderError`.
 * `breakOnPurpose` injects invalid GLSL (test hook for the fallback path).
 */
export function createSwapPanelMaterial(opts: { onPatchFailed: () => void; breakOnPurpose?: boolean }): SwapPanelMaterial {
  const uniforms = createPanelUniforms();
  const material = new MeshStandardMaterial({ roughness: 0.9, metalness: 0, color: 0xffffff });
  material.name = 'panel';
  material.customProgramCacheKey = () => 'stimpy-swap-panel-v1';
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    const hasAll =
      shader.vertexShader.includes('#include <common>') &&
      shader.vertexShader.includes('#include <begin_vertex>') &&
      shader.fragmentShader.includes('#include <common>') &&
      shader.fragmentShader.includes('#include <map_fragment>');
    if (!hasAll) {
      opts.onPatchFailed();
      return;
    }
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', VERT_COMMON).replace('#include <begin_vertex>', VERT_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAG_COMMON)
      .replace('#include <map_fragment>', opts.breakOnPurpose ? 'this is not glsl;' : FRAG_MAP);
  };
  return { material, uniforms };
}
