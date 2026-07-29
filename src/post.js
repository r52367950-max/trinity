import * as THREE from 'three';

/**
 * HDR pipeline: the scene is rendered linear into a floating point buffer,
 * bloom is gathered from it with a small mip chain, and the composite does
 * ACES tone mapping, vignette and dithering in one pass.
 *
 * Doing tone mapping at the end rather than per-material is what lets the sun
 * glitter on the water blow out and bleed the way it does through a real lens.
 */

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

function pass(uniforms, fragmentShader) {
  return new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader, depthTest: false, depthWrite: false });
}

export class Post {
  constructor(renderer, { levels = 5 } = {}) {
    this.renderer = renderer;
    this.levels = levels;
    this.enabled = true;
    this.bloomStrength = 0.5;

    const type = THREE.HalfFloatType;
    this.sceneRT = new THREE.WebGLRenderTarget(2, 2, {
      type, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      samples: 4,
    });
    this.mips = [];
    for (let i = 0; i < levels; i++) {
      this.mips.push(new THREE.WebGLRenderTarget(2, 2, {
        type, format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: false,
      }));
    }

    this.brightMat = pass({
      uTexture: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: 1.15 },
      uKnee: { value: 0.7 },
    }, /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform vec2 uTexel;
      uniform float uThreshold, uKnee;
      void main() {
        vec3 c = vec3(0.0);
        c += texture2D(uTexture, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
        c += texture2D(uTexture, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
        c += texture2D(uTexture, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
        c += texture2D(uTexture, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
        c *= 0.25;
        float l = max(c.r, max(c.g, c.b));
        // soft knee so highlights ramp in instead of popping
        float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
        soft = soft * soft / (4.0 * uKnee + 1e-4);
        float w = max(soft, l - uThreshold) / max(l, 1e-4);
        gl_FragColor = vec4(c * w, 1.0);
      }
    `);

    this.downMat = pass({
      uTexture: { value: null },
      uTexel: { value: new THREE.Vector2() },
    }, /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform vec2 uTexel;
      void main() {
        vec3 c = vec3(0.0);
        c += texture2D(uTexture, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
        c += texture2D(uTexture, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
        c += texture2D(uTexture, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
        c += texture2D(uTexture, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
        c += texture2D(uTexture, vUv).rgb * 1.4;
        gl_FragColor = vec4(c / 5.4, 1.0);
      }
    `);

    this.upMat = pass({
      uTexture: { value: null },
      uTexel: { value: new THREE.Vector2() },
    }, /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform vec2 uTexel;
      void main() {
        // 3x3 tent
        vec3 c = vec3(0.0);
        c += texture2D(uTexture, vUv + uTexel * vec2(-1.0, -1.0)).rgb * 1.0;
        c += texture2D(uTexture, vUv + uTexel * vec2( 0.0, -1.0)).rgb * 2.0;
        c += texture2D(uTexture, vUv + uTexel * vec2( 1.0, -1.0)).rgb * 1.0;
        c += texture2D(uTexture, vUv + uTexel * vec2(-1.0,  0.0)).rgb * 2.0;
        c += texture2D(uTexture, vUv).rgb * 4.0;
        c += texture2D(uTexture, vUv + uTexel * vec2( 1.0,  0.0)).rgb * 2.0;
        c += texture2D(uTexture, vUv + uTexel * vec2(-1.0,  1.0)).rgb * 1.0;
        c += texture2D(uTexture, vUv + uTexel * vec2( 0.0,  1.0)).rgb * 2.0;
        c += texture2D(uTexture, vUv + uTexel * vec2( 1.0,  1.0)).rgb * 1.0;
        gl_FragColor = vec4(c / 16.0, 1.0);
      }
    `);
    this.upMat.blending = THREE.AdditiveBlending;
    this.upMat.transparent = true;

    this.compositeMat = pass({
      uScene: { value: null },
      uBloom: { value: null },
      uExposure: { value: 1.0 },
      uBloomStrength: { value: 0.5 },
      uTime: { value: 0 },
      uVignette: { value: 0.32 },
    }, /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uScene, uBloom;
      uniform float uExposure, uBloomStrength, uTime, uVignette;

      // ACES filmic curve
      vec3 aces(vec3 x) {
        const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c) {
        return mix(c * 12.92, 1.055 * pow(max(c, 1e-5), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }

      void main() {
        vec3 col = texture2D(uScene, vUv).rgb;
        vec3 bloom = texture2D(uBloom, vUv).rgb;
        col += bloom * uBloomStrength;
        col *= uExposure;

        // desaturate the very brightest values slightly, as film does
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(col, vec3(l), smoothstep(3.0, 14.0, l) * 0.35);

        col = aces(col);
        // gentle filmic S-curve: the ACES fit alone leaves midtones flat
        col = clamp(mix(col, col * col * (3.0 - 2.0 * col), 0.22), 0.0, 1.0);

        vec2 q = vUv - 0.5;
        col *= 1.0 - uVignette * dot(q, q) * 1.6;

        col = toSRGB(col);
        // ordered-ish dither: kills banding in the sky gradient
        float n = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
        col += (n - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }
    `);

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene().add(this.quad);
    this.camera = new THREE.Camera();
  }

  setSize(w, h) {
    this.width = w; this.height = h;
    this.sceneRT.setSize(w, h);
    let mw = w, mh = h;
    for (let i = 0; i < this.levels; i++) {
      mw = Math.max(2, Math.floor(mw / 2));
      mh = Math.max(2, Math.floor(mh / 2));
      this.mips[i].setSize(mw, mh);
    }
  }

  _blit(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  render(time) {
    const r = this.renderer;
    this.compositeMat.uniforms.uScene.value = this.sceneRT.texture;
    this.compositeMat.uniforms.uBloom.value = this.mips[0].texture;
    this.compositeMat.uniforms.uTime.value = time;

    if (!this.enabled) {
      this.compositeMat.uniforms.uBloomStrength.value = 0;
      this._blit(this.compositeMat, null);
      return;
    }
    this.compositeMat.uniforms.uBloomStrength.value = this.bloomStrength;

    const prevAuto = r.autoClear;
    r.autoClear = true;

    this.brightMat.uniforms.uTexture.value = this.sceneRT.texture;
    this.brightMat.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
    this._blit(this.brightMat, this.mips[0]);

    for (let i = 1; i < this.levels; i++) {
      const src = this.mips[i - 1];
      this.downMat.uniforms.uTexture.value = src.texture;
      this.downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this._blit(this.downMat, this.mips[i]);
    }
    r.autoClear = false;
    for (let i = this.levels - 1; i > 0; i--) {
      const src = this.mips[i];
      this.upMat.uniforms.uTexture.value = src.texture;
      this.upMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this._blit(this.upMat, this.mips[i - 1]);
    }
    r.autoClear = prevAuto;
    this._blit(this.compositeMat, null);
  }
}
