import * as THREE from 'three';

/**
 * Uniform objects shared by every material in the scene.
 *
 * Sharing the actual uniform *objects* (not their values) means a single
 * per-frame write updates the sky, the ocean, the terrain and the boat at
 * once, and guarantees the atmosphere stays consistent across all of them —
 * which is what makes the horizon read as one continuous space instead of a
 * plane pasted in front of a backdrop.
 */
export const shared = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.28, -0.87).normalize() },
  uSunColor: { value: new THREE.Color(1.0, 0.86, 0.68) },
  uSunIntensity: { value: 1.5 },   // drives water specular and scatter
  uSkyScale: { value: 0.72 },      // exposure of the scattering table
  uSkyLUT: { value: null },
  uSkyCube: { value: null },
  uCameraPos: { value: new THREE.Vector3() },
  uInvView: { value: new THREE.Matrix4() },
  uCloudTime: { value: 0 },
  uCloudCover: { value: 0.42 },
  uWindDir: { value: new THREE.Vector2(0, 1) },
  uWindSpeed: { value: 7.5 },
  // Aerial perspective
  uFogDensity: { value: 1.0 / 7600.0 },
  uFogHeight: { value: 780.0 },
  uExposure: { value: 1.0 },
};

/** Water plane sits at y = 0 everywhere. */
export const SEA_LEVEL = 0.0;

export const KNOTS = 1.94384; // m/s -> knots
