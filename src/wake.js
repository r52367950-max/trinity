import * as THREE from 'three';

/**
 * Persistent wake buffer.
 *
 * A single channel texture that covers a square region of ocean around the
 * boat and scrolls with it. Every frame the previous contents are resampled at
 * the new offset, blurred a little (foam spreads), faded a little (foam
 * dissolves), and the hull stamps fresh turbulence into it: a broad churn off
 * the stern plus the two diverging arms of a Kelvin wake off the bow.
 *
 * The ocean shader reads it as an extra foam term, so the boat leaves a trail
 * that persists in world space for half a minute behind it.
 */
export class Wake {
  constructor(renderer, { size = 512, region = 320 } = {}) {
    this.renderer = renderer;
    this.region = region;
    this.center = new THREE.Vector2(0, 0);
    this._prevCenter = new THREE.Vector2(0, 0);

    const opts = {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.write = new THREE.WebGLRenderTarget(size, size, opts);
    this.read = new THREE.WebGLRenderTarget(size, size, opts);
    for (const rt of [this.write, this.read]) {
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, false, false);
    }
    renderer.setRenderTarget(null);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: this.read.texture },
        uOffset: { value: new THREE.Vector2() },
        uFade: { value: 0.99 },
        uTexel: { value: 1 / size },
        uSize: { value: size },
        uRegion: { value: region },
        uBoat: { value: new THREE.Vector2(0.5, 0.5) },
        uBoatDir: { value: new THREE.Vector2(0, 1) },
        uStrength: { value: 0 },
        uBoatLen: { value: 9 },
        uSpray: { value: 0 },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uPrev;
        uniform vec2 uOffset;
        uniform float uFade, uTexel, uRegion;
        uniform vec2 uBoat, uBoatDir;
        uniform float uStrength, uBoatLen, uSpray;

        void main() {
          vec2 p = vUv + uOffset;
          float v = 0.0;
          if (p.x > 0.0 && p.x < 1.0 && p.y > 0.0 && p.y < 1.0) {
            float c = texture2D(uPrev, p).r;
            float b =
              texture2D(uPrev, p + vec2( uTexel, 0.0)).r +
              texture2D(uPrev, p + vec2(-uTexel, 0.0)).r +
              texture2D(uPrev, p + vec2(0.0,  uTexel)).r +
              texture2D(uPrev, p + vec2(0.0, -uTexel)).r;
            v = mix(c, b * 0.25, 0.30) * uFade;
          }

          // position relative to the hull, in metres, rotated into boat space
          vec2 d = (vUv - uBoat) * uRegion;
          vec2 f = normalize(uBoatDir);
          vec2 s = vec2(f.y, -f.x);
          float along = dot(d, f);     // + is ahead of the boat
          float across = dot(d, s);

          // churn dragged behind the transom
          float sternX = smoothstep(1.0, -uBoatLen * 0.55, along);
          float sternY = exp(-pow(across / (1.05 + uStrength * 0.55), 2.0));
          float stern = sternX * sternY;

          // Kelvin arms: foam shed sideways at ~19.5 degrees from the bow
          float bow = along - uBoatLen * 0.42;
          float arm = 0.0;
          if (bow < 1.0) {
            float spread = -bow * 0.3541;             // tan(19.47 deg)
            float dist = abs(abs(across) - spread);
            arm = exp(-pow(dist / 0.65, 2.0)) * smoothstep(1.0, -1.0, bow) *
                  smoothstep(-26.0, -3.0, bow);
          }

          float stamp = clamp(stern * 0.95 + arm * 0.75, 0.0, 1.0) * uStrength;
          // bow spray when driving hard
          stamp += uSpray * exp(-pow((along - uBoatLen * 0.45) / 1.6, 2.0)) *
                            exp(-pow(across / 1.2, 2.0));

          gl_FragColor = vec4(max(v, clamp(stamp, 0.0, 1.0)), 0.0, 0.0, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene().add(this.quad);
    this.camera = new THREE.Camera();
  }

  /** The most recently rendered buffer — the ocean reads this. */
  get texture() { return this.read.texture; }

  /** boatPos: Vector3, heading: forward direction as Vector2(x, z). */
  update(dt, boatPos, heading, speed, hullLength) {
    const u = this.material.uniforms;
    this._prevCenter.copy(this.center);
    // keep the region centred on the boat, but only move in whole texels so
    // the resample stays free of drift
    const texel = this.region / this.write.width;
    this.center.set(Math.round(boatPos.x / texel) * texel, Math.round(boatPos.z / texel) * texel);

    u.uOffset.value.set(
      (this.center.x - this._prevCenter.x) / this.region,
      (this.center.y - this._prevCenter.y) / this.region
    );
    u.uPrev.value = this.read.texture;
    u.uFade.value = Math.exp(-dt / 26.0);
    u.uBoat.value.set(
      (boatPos.x - this.center.x) / this.region + 0.5,
      (boatPos.z - this.center.y) / this.region + 0.5
    );
    u.uBoatDir.value.copy(heading);
    u.uBoatLen.value = hullLength;
    u.uStrength.value = Math.min(1, Math.max(0, (speed - 0.35) / 3.2));
    u.uSpray.value = Math.min(1, Math.max(0, (speed - 3.4) / 3.0)) * 0.85;

    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.write);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prevTarget);

    const t = this.write; this.write = this.read; this.read = t;
  }
}
