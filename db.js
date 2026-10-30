/* Penyimpanan di HP (IndexedDB): data hasil sinkron, sesi, dan antrean kiriman. */
const DB = (() => {
  let dbp = null;
  function buka() {
    if (!dbp) dbp = new Promise((ok, gagal) => {
      const r = indexedDB.open('posyandu-merden', 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('antrean', { keyPath: 'qid' }); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => gagal(r.error);
    });
    return dbp;
  }
  function jalan(store, mode, fn) {
    return buka().then(d => new Promise((ok, gagal) => {
      const t = d.transaction(store, mode), s = t.objectStore(store);
      let hasil; const r = fn(s);
      if (r) r.onsuccess = () => { hasil = r.result; };
      t.oncomplete = () => ok(hasil);
      t.onerror = () => gagal(t.error);
      t.onabort = () => gagal(t.error);
    }));
  }
  return {
    get: k => jalan('kv', 'readonly', s => s.get(k)),
    set: (k, v) => jalan('kv', 'readwrite', s => s.put(v, k)),
    del: k => jalan('kv', 'readwrite', s => s.delete(k)),
    antrean: () => jalan('antrean', 'readonly', s => s.getAll()),
    simpanAntrean: it => jalan('antrean', 'readwrite', s => s.put(it)),
    hapusAntrean: qid => jalan('antrean', 'readwrite', s => s.delete(qid)),
    kosongkan: () => buka().then(d => new Promise((ok, gagal) => {
      const t = d.transaction(['kv', 'antrean'], 'readwrite');
      t.objectStore('kv').clear(); t.objectStore('antrean').clear();
      t.oncomplete = ok; t.onerror = () => gagal(t.error);
    }))
  };
})();
