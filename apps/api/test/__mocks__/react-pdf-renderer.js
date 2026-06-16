/**
 * Test stub for `@react-pdf/renderer`.
 *
 * The real package is ESM-only and pulls in `@react-pdf/primitives`, which
 * Jest cannot transform out of the box. The tenant-isolation suite never
 * renders a PDF, so we replace the whole module with a permissive stub that
 * survives top-level usage like `StyleSheet.create(...)` and `Font.register(...)`
 * inside the PDF template modules at import time.
 */
function makeStub() {
  const fn = function stub() {
    return makeStub();
  };
  return new Proxy(fn, {
    get(_target, prop) {
      if (prop === 'create') return (styles) => styles || {};
      if (prop === 'register') return () => undefined;
      if (prop === 'renderToBuffer')
        return async () => Buffer.from('stub-pdf');
      if (prop === 'renderToStream') return async () => makeStub();
      if (prop === '__esModule') return true;
      if (prop === Symbol.toPrimitive) return () => '';
      return makeStub();
    },
    apply() {
      return makeStub();
    },
  });
}

module.exports = makeStub();
