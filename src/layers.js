/**
 * Render layers.
 *
 * Scenery that costs a lot of draw calls but contributes little to a wave
 * distorted mirror — trees, rocks, gulls — lives on PROP_LAYER. The main camera
 * sees it; the reflection camera does not.
 */
export const PROP_LAYER = 1;
