// Small fallbacks so the app also runs on older phones (Android phones with
// an out-of-date Chrome or Samsung Internet, older iPhones). Loaded first, in
// main.jsx. Only fills in what the browser is missing.

// list.at(-1): Chrome 92 / Safari 15.4 / Samsung Internet 16.
for (const proto of [Array.prototype, String.prototype]) {
  if (!proto.at) {
    Object.defineProperty(proto, 'at', {
      configurable: true,
      writable: true,
      value(n) {
        const i = Math.trunc(n) || 0;
        const k = i < 0 ? this.length + i : i;
        return k < 0 || k >= this.length ? undefined : this[k];
      },
    });
  }
}

// structuredClone: Chrome 98 / Safari 15.4. Everything the app clones
// (rounds, courses) is plain JSON data, so a JSON copy is the same.
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
}
