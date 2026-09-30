// never finishes init, so the host never reports; used to test the runner watchdog
export default { engine: 'none', variant: 'hangs', init() { return new Promise(() => {}); }, setCount() {}, frame() {} };
