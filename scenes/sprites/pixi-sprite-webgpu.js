// PixiJS v8 sprites scene, Sprite variant on the WebGPU renderer: the same scene code as pixi-sprite.js,
// with Application preference 'webgpu'. Init throws if Pixi fell back to another renderer.
import { makeScene } from './pixi-sprite.js';

export default makeScene('webgpu');
