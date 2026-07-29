import { shared } from './shared.js';
import { SKY_SAMPLE_GLSL } from './atmosphere.js';

/**
 * Patch a stock three.js material so it fades into the same analytic sky the
 * dome and the ocean use. Without this the island would sit in front of the
 * horizon like a sticker; with it, distance reads correctly.
 */
export function applyAtmosphere(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSkyLUT = shared.uSkyLUT;
    shader.uniforms.uSunDir = shared.uSunDir;
    shader.uniforms.uSunColor = shared.uSunColor;
    shader.uniforms.uCameraPos = shared.uCameraPos;
    shader.uniforms.uFogDensity = shared.uFogDensity;
    shader.uniforms.uFogHeight = shared.uFogHeight;
    shader.uniforms.uInvView = shared.uInvView;

    shader.vertexShader =
      'varying vec3 vAtmoWorld;\nuniform mat4 uInvView;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vAtmoWorld = (uInvView * mvPosition).xyz;'
      );

    shader.fragmentShader =
      'varying vec3 vAtmoWorld;\n' +
      SKY_SAMPLE_GLSL +
      '\n' +
      shader.fragmentShader.replace(
        '#include <tonemapping_fragment>',
        '  gl_FragColor.rgb = applyAerial(gl_FragColor.rgb, vAtmoWorld);\n#include <tonemapping_fragment>'
      );
  };
  material.customProgramCacheKey = () => 'atmo1';
  return material;
}
