// Init script: captures the game's THREE.Scene as window.__SCENE (the game keeps it inside a closure).
// three.r128 UMD does `global.THREE = {}` and fills that object afterwards, so we hand the page a Proxy
// whose `Scene` getter returns a recording subclass.
module.exports = () => {
  let real = null, proxy = null, Wrapped = null;
  Object.defineProperty(window, 'THREE', {
    configurable: true,
    get() { return proxy; },
    set(v) {
      real = v;
      proxy = new Proxy(v, {
        get(t, k) {
          if (k === 'Scene' && t.Scene) {
            if (!Wrapped) { const S = t.Scene; Wrapped = class extends S { constructor(...a) { super(...a); window.__SCENE = this; } }; }
            return Wrapped;
          }
          return t[k];
        },
      });
    },
  });
  // helpers usable from page.evaluate
  window.__sceneStats = () => {
    const s = window.__SCENE; if (!s) return null;
    let objs = 0, meshes = 0, visMeshes = 0;
    s.traverse(o => { objs++; if (o.isMesh || o.isInstancedMesh) { meshes++; } });
    s.traverseVisible(o => { if (o.isMesh || o.isInstancedMesh) visMeshes++; });
    return { children: s.children.length, objs, meshes, visMeshes, fog: s.fog && s.fog.color.getHexString(), bg: s.background && s.background.getHexString() };
  };
  // visible additive red ground strips (charge warning lines) and pink shockwave rings
  window.__fx = () => {
    const s = window.__SCENE; const out = { warn: 0, warnOp: 0, waves: [] };
    for (const o of s.children) {
      if (!o.isMesh || !o.visible || !o.material || !o.material.color) continue;
      const h = o.material.color.getHex();
      if (h === 0xff2a1a && o.material.blending === 2) { out.warn++; out.warnOp = Math.max(out.warnOp, o.material.opacity); }
      if (h === 0xff3a9a) out.waves.push({ x: o.position.x, z: o.position.z, r: o.scale.x });
    }
    return out;
  };
};
