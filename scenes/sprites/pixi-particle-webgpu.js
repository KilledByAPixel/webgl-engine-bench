// PixiJS v8 sprites scene, ParticleContainer variant on the WebGPU renderer: the same scene code as
// pixi-particle.js, with Application preference 'webgpu'. Init throws if Pixi fell back to another renderer.
import { makeScene } from './pixi-particle.js';

export default makeScene('webgpu');
