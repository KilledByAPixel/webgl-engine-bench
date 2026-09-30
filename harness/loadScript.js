// load a classic (non-module) script, for engines that ship as globals like littlejs.release.js
export const loadScript = src => new Promise((ok, fail) => {
  const s = document.createElement('script');
  s.src = src; s.onload = () => ok(); s.onerror = () => fail(new Error('failed to load ' + src));
  document.head.appendChild(s);
});
