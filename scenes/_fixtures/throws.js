export default { engine: 'none', variant: 'throws',
  async init() { throw new Error('fixture: init failed on purpose'); }, setCount() {}, frame() {} };
