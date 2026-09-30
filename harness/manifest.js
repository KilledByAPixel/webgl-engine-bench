export const TESTS = {
  sprites: ['littlejs', 'littlejs-gldraw', 'pixi-sprite', 'pixi-particle', 'pixi-particle-webgpu'],
  cubes: ['littlejs', 'littlejs-instanced', 'three-mesh', 'three-instanced', 'playcanvas-instanced'],
};

// A wider check, kept out of the main suite (--extended): other engines' fast and default paths, and the WebGPU
// renderers of Pixi and Three. The main comparison stays LittleJS vs Pixi and Three on WebGL.
export const EXTENDED = {
  sprites: ['pixi-sprite-webgpu', 'phaser-sprite', 'phaser-fast'],
  cubes: ['three-mesh-webgpu', 'three-instanced-webgpu', 'babylon-instances', 'babylon-thin', 'playcanvas-entity'],
};
export const suiteScenes = (extended = false) => extended
  ? Object.fromEntries(Object.entries(TESTS).map(([t, s]) => [t, [...s, ...(EXTENDED[t] || [])]]))
  : TESTS;
