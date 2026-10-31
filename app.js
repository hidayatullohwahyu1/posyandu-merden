/* =====================================================================
   POSYANDU MERDEN — aplikasi PWA
   Alur data:
     S.dasar  = data yang sudah dikonfirmasi server (hasil sinkron + balasan kiriman)
     antrean  = perubahan yang belum terkirim (tersimpan di HP)
     S.d      = S.dasar + antrean diterapkan → yang ditampilkan di layar
   Jadi isian kader langsung terlihat walau tanpa sinyal, dan bila sebuah
   kiriman ditolak server, tampilan kembali ke data server.
   ===================================================================== */
'use strict';

const C = window.CONFIG_APP;
const S = {
  sesi: null, dasar: null, d: null, antrean: [], kirim: false, online: navigator.onLine,
  pos: '', periode: null, cari: '', filterUkur: 'belum', tabImun: 'Jatuh tempo', grafik: 'bbu', filterBalita: 'Aktif',
  pasang: null, swBaru: null, galatLogin: ''
};

/* ---------- Utilitas ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const angka = v => (v === '' || v === null || v === undefined) ? '–' : String(v).replace('.', ',');
const kosongNull = v => (v === '' || v === undefined) ? null : v;
function hariIni() { const t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); }
const periodeKini = () => hariIni().slice(0, 7);
const fmtTgl = s => s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : '–';
function usiaTeks(bln) {
  if (bln === null || bln === undefined || isNaN(bln)) return '–';
  if (bln < 12) return bln + ' bln';
  const t = Math.floor(bln / 12), b = bln % 12;
  return t + ' th' + (b ? ' ' + b + ' bln' : '');
}
/* ---------- Penulisan isian sesuai kaidah Indonesia ----------
   Desimal memakai koma (8,5 kg), nama ditulis HURUF KAPITAL seperti di KK,
   RT/RW tiga angka (RT/RW 001/002), No HP diawali 08. */
const rapiSpasi = s => String(s || '').replace(/\s+/g, ' ').trim();
const rapiNama = s => rapiSpasi(String(s || '').replace(/[‘’`´]/g, "'")).toUpperCase();
const namaSah = s => /^\p{L}[\p{L} .,'-]*$/u.test(s);
const rapiRT = s => String(s || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
const rtRw = b => 'RT/RW ' + [b.rt, b.rw].map(v => v ? String(v).padStart(3, '0') : '–').join('/');
function rapiHP(s) {
  let n = String(s || '').replace(/[^\d+]/g, '');
  if (n.indexOf('+62') === 0) n = '0' + n.slice(3);
  else if (n.indexOf('62') === 0) n = '0' + n.slice(2);
  else if (n.indexOf('8') === 0) n = '0' + n;
  return n.replace(/\D/g, '');
}
/* '8,5' / '8.5' / '8,5 kg' → 8.5; kosong → ''; bukan angka → NaN */
function bacaAngka(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().replace(/\s*(kg|cm|gram|g)$/i, '').replace(',', '.');
  if (!s) return '';
  return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
}
/* Berat lahir dalam gram: '3200', '3.200' (titik ribuan) dan '3,2' (kg) → 3200 */
function gramLahir(v) {
  const n = bacaAngka(String(v === null || v === undefined ? '' : v).trim().replace(/^(\d{1,2})\.(\d{3})$/, '$1$2'));
  return n === '' || isNaN(n) ? n : Math.round(n < 10 ? n * 1000 : n);
}
const ribuan = n => Number(n).toLocaleString('id-ID');
/* Digit 7–12 NIK = tanggal lahir (DDMMYY, perempuan +40) */
function infoNIK(nik) {
  if (!/^\d{16}$/.test(nik)) return null;
  let dd = +nik.slice(6, 8), jk = 'L';
  const mm = +nik.slice(8, 10), yy = +nik.slice(10, 12);
  if (dd > 40) { dd -= 40; jk = 'P'; }
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
  let tgl = (2000 + yy) + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
  if (tgl > hariIni()) tgl = (1900 + yy) + tgl.slice(4);
  return { tgl, jk };
}
const urutNama = (a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
const inisial = n =>String(n || '?').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('');
const idBaru = p => p + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
async function sha12(teks) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(teks));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

const IKON = {
  rumah: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  ukur: '<path d="M4 20V4m0 16h16M8 16l3-4 3 2 4-6"/>',
  suntik: '<path d="M18 2l4 4m-6-2l4 4M12 6l6 6-8 8H4v-6zM9 9l2 2m-5 1l2 2"/>',
  awas: '<path d="M12 3l10 18H2zM12 10v5m0 3v.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  cari: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  kembali: '<path d="M15 5l-7 7 7 7"/>',
  centang: '<path d="M5 12l5 5 9-10"/>',
  jam: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  tambah: '<path d="M12 5v14M5 12h14"/>',
  kanan: '<path d="M9 5l7 7-7 7"/>',
  kapsul: '<path d="M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7z"/><path d="M7 7l7 7"/>',
  orang: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20c0-2.9-1.7-5.3-4.3-6.1"/>',
  papan: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  awan: '<path d="M7 18a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 11.5 3.5 3.5 0 0 1 17.5 18z"/><path d="M12 11v5m-2.2-2.2L12 16l2.2-2.2"/>',
  segar: '<path d="M20 11a8 8 0 0 0-14.6-4.4M4 3.5V7h3.5M4 13a8 8 0 0 0 14.6 4.4M20 20.5V17h-3.5"/>',
  gembok: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  dokumen: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  batang: '<path d="M5 20V11M11 20V5M17 20v-7M3 20h18"/>',
  akun: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  bayi: '<circle cx="12" cy="7" r="3.5"/><path d="M6.5 21v-3.5a5.5 5.5 0 0 1 11 0V21M9 21v-3M15 21v-3"/>',
  setuju: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.2l2.4 2.4 4.8-5"/>'
};
const ikon = (n, s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IKON[n]}</svg>`;

function toast(pesan, lama = 3200) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = pesan;
  document.body.appendChild(t); setTimeout(() => t.remove(), lama);
}

/* ---------- Lembar bawah & dialog ----------
   Tombol Kembali di HP menutup lembar/dialog yang terbuka lebih dulu, bukan meninggalkan halaman.
   Semua lapisan berbagi satu entri riwayat {lapis: 1}. */
const lapisan = [];
let abaikanPop = false;
function pasangLapis(tutup) {
  if (!lapisan.length && !(history.state && history.state.lapis)) history.pushState({ lapis: 1 }, '');
  lapisan.push(tutup);
}
function lepasLapis(tutup, tanpaRiwayat) {
  const i = lapisan.indexOf(tutup);
  if (i >= 0) lapisan.splice(i, 1);
  if (!lapisan.length && !tanpaRiwayat && history.state && history.state.lapis) { abaikanPop = true; history.back(); }
}
window.addEventListener('popstate', () => {
  if (abaikanPop) { abaikanPop = false; return; }
  const tutup = lapisan.pop();
  if (!tutup) return;
  if (lapisan.length) history.pushState({ lapis: 1 }, '');
  tutup();
});

function hapusTirai() { const t = $('#tirai'); if (t) t.remove(); }
function bukaLembar(html, setelah) {
  // Lembar diganti lembar lain (mis. hasil -> berikutnya): pakai entri riwayat yang sama
  if ($('#tirai')) hapusTirai(); else pasangLapis(hapusTirai);
  const t = document.createElement('div');
  t.className = 'tirai'; t.id = 'tirai';
  t.innerHTML = `<div class="lembar" role="dialog" aria-modal="true"><div class="pegangan"></div>${html}</div>`;
  t.addEventListener('click', e => { if (e.target === t) tutupLembar(); });
  document.body.appendChild(t);
  if (setelah) setelah(t.firstElementChild);
  return t.firstElementChild;
}
function tutupLembar(tanpaRiwayat) { if (!$('#tirai')) return; hapusTirai(); lepasLapis(hapusTirai, tanpaRiwayat); }
function konfirmasi(judul, isi, ya = 'Ya', bahaya = false) {
  return new Promise(ok => {
    const t = document.createElement('div');
    t.className = 'tirai tengah';
    t.innerHTML = `<div class="dialog"><h3 style="margin:0 0 8px">${esc(judul)}</h3><div class="redup" style="margin-bottom:18px">${isi}</div>
      <div class="deret-tombol"><button class="tombol garis" data-j="0">Batal</button><button class="tombol ${bahaya ? 'bahaya' : ''}" data-j="1">${esc(ya)}</button></div></div>`;
    const batal = () => { t.remove(); ok(false); };
    t.addEventListener('click', e => { const b = e.target.closest('[data-j]'); if (b || e.target === t) { t.remove(); lepasLapis(batal); ok(b && b.dataset.j === '1'); } });
    document.body.appendChild(t);
    pasangLapis(batal);
  });
}

/* ---------- API ---------- */
async function api(action, data, opsi = {}) {
  if (!C.API_URL || C.API_URL.indexOf('GANTI_') >= 0) return { ok: false, pesan: 'Alamat API belum diatur di config.js.' };
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), opsi.batas || 45000);
  try {
    const body = { action, token: S.sesi ? S.sesi.token : '', data };
    if (opsi.items) body.items = opsi.items;
    const res = await fetch(C.API_URL, { method: 'POST', body: JSON.stringify(body), signal: ctrl.signal, redirect: 'follow' });
    const j = await res.json();
    S.online = true;
    if (!j.ok && j.sesi) sesiBerakhir(j.pesan);
    return j;
  } catch (e) {
    return { ok: false, jaringan: true, pesan: 'Tidak ada sinyal atau server tidak menjawab. Coba lagi nanti.' };
  } finally { clearTimeout(t); }
}

/* ---------- Data ---------- */
function olahData(raw) {
  const ob = (kol, r) => { const o = {}; kol.forEach((k, i) => { o[k] = r[i]; }); return o; };
  const ukur = {}, imun = {}, vit = {};
  raw.ukur.forEach(r => { const o = ob(raw.kolUkur, r); (ukur[o.id] = ukur[o.id] || {})[o.periode] = o; });
  raw.imun.forEach(r => { (imun[r[0]] = imun[r[0]] || {})[r[1]] = { tgl: r[2], id: r[3], tempat: r[4] }; });
  raw.vit.forEach(r => { (vit[r[0]] = vit[r[0]] || []).push({ periode: r[1], jenis: r[2], tgl: r[3], id: r[4] }); });
  const lay = raw.layanan || { kpsp: [], pd3i: [] }, kpsp = {};
  lay.kpsp.forEach(r => { (kpsp[r[0]] = kpsp[r[0]] || {})[r[1]] = kpspObj(r); });
  const ls = raw.lansia || { kolLansia: [], lansia: [], kolPeriksa: KOL_PERIKSA_L, periksa: [] }, periksaL = {};
  ls.periksa.forEach(r => { const o = ob(ls.kolPeriksa, r); (periksaL[o.id] = periksaL[o.id] || {})[o.periode] = o; });
  return {
    waktu: raw.waktu, waktuSinkron: Date.now(), user: raw.user, posyandu: raw.posyandu, desa: raw.desa,
    kolUkur: raw.kolUkur, balita: raw.balita.map(r => ob(raw.kolBalita, r)), ukur, imun, vit,
    tl: raw.tl, usulan: raw.usulan, jadwal: raw.jadwal, kbm: raw.kbm, kunci: raw.kunci, kpsp, pd3i: lay.pd3i.map(pd3iObj),
    lansia: ls.lansia.map(r => ob(ls.kolLansia, r)), kolPeriksaL: ls.kolPeriksa, periksaL
  };
}
const KOL_PERIKSA_L = ['id', 'periode', 'tgl', 'bb', 'tb', 'imt', 'stIMT', 'lp', 'stLP', 'sistol', 'diastol', 'stTD', 'obat', 'merokok', 'label', 'alasan', 'diubahPada', 'petugas'];
const kpspObj = r => ({ usia: +r[1], tgl: r[2], ya: +r[3], hasil: r[4], tdd: r[5], tdl: r[6], catatan: r[7], id: r[8] });
const pd3iObj = r => ({ idLapor: r[0], id: r[1], penyakit: r[2], tglGejala: r[3], gejala: r[4], imun: r[5], status: r[6], tl: r[7], pelapor: r[8], tglLapor: r[9] });
function barisKeUkur(arr) { const o = {}; S.dasar.kolUkur.forEach((k, i) => { o[k] = arr[i]; }); return o; }

/* Susun tampilan = data server + antrean yang belum terkirim */
function susunData() {
  if (!S.dasar) { S.d = null; return; }
  const d = typeof structuredClone === 'function' ? structuredClone(S.dasar) : JSON.parse(JSON.stringify(S.dasar));
  d.byId = {};
  d.kpsp = d.kpsp || {}; d.pd3i = d.pd3i || [];   // data tersimpan dari versi lama
  d.lansia = d.lansia || []; d.periksaL = d.periksaL || {}; d.lansiaById = {};
  d.lansia.forEach(l => { d.lansiaById[l.id] = l; });
  d.balita.forEach(b => { d.byId[b.id] = b; });
  S.antrean.filter(it => it.status !== 'gagal').forEach(it => terapkanLokal(d, it));
  S.d = d;
}

function riwayatLokal(d, id, periode, bulan) {
  const batas = geserPeriode(periode, -(bulan || 6)), u = d.ukur[id] || {};
  return Object.keys(u).filter(p => p < periode && p >= batas).map(p => ({ periode: p, bb: u[p].bb, nt: u[p].nt, zTBU: kosongNull(u[p].zTBU), label: u[p].label }));
}

function hitungLokal(d, b, u) {
  const g = hitungGizi({ jk: b.jk, tglLahir: b.tglLahir, tglUkur: u.tglUkur, bb: u.bb, tb: u.tb, cara: u.cara, lila: u.lila, lk: u.lk });
  const riw = riwayatLokal(d, b.id, u.periode, 6);
  const nt = +u.bb > 0 ? hitungNT(+u.bb, g.usiaBln, u.periode, riw, d.kbm) : { nt: '', duaT: false, selisihG: null };
  const lab = hitungLabel(g, nt, u.periode, riw);
  const v = x => x === null ? '' : x;
  return { id: b.id, periode: u.periode, tglUkur: u.tglUkur, usiaBln: g.usiaBln, bb: +u.bb || '', tb: +u.tb || '', cara: +u.tb ? u.cara : '',
    lila: +u.lila || '', lk: +u.lk || '', zBBU: v(g.zBBU), zTBU: v(g.zTBU), zBBTB: v(g.zBBTB), zLKU: v(g.zLKU),
    stBBU: g.stBBU, stTBU: g.stTBU, stBBTB: g.stBBTB, stLKU: g.stLKU, stLILA: g.stLILA, nt: nt.nt, selisih: v(nt.selisihG),
    label: lab.label, alasan: lab.alasan.join('; '), tbKoreksi: v(g.tbKoreksi), diubahPada: '', petugas: S.sesi ? S.sesi.user.username : '', _lokal: true };
}

/* Terapkan satu perubahan antrean ke data d (tampilan) */
function terapkanLokal(d, it) {
  const x = it.data, b = d.byId[x.id];
  switch (it.action) {
    case 'simpanPengukuran':
      if (!b) return;
      (d.ukur[b.id] = d.ukur[b.id] || {})[x.periode] = hitungLokal(d, b, x);
      { const p2 = geserPeriode(x.periode, 1), r2 = d.ukur[b.id][p2];
        if (r2) d.ukur[b.id][p2] = Object.assign({}, hitungLokal(d, b, { periode: p2, tglUkur: r2.tglUkur, bb: r2.bb, tb: r2.tb, cara: r2.cara, lila: r2.lila, lk: r2.lk }), { _lokal: r2._lokal }); }
      break;
    case 'hapusPengukuran':
      if (d.ukur[x.id]) delete d.ukur[x.id][x.periode];
      break;
    case 'simpanImunisasi':
      (d.imun[x.id] = d.imun[x.id] || {})[x.kode] = { tgl: x.tgl, tempat: x.tempat, _lokal: true };
      break;
    case 'hapusImunisasi':
      if (d.imun[x.id]) delete d.imun[x.id][x.kode];
      break;
    case 'simpanVitamin': {
      const per = x.jenis === 'Obat_Cacing' ? x.tgl.slice(0, 7) : periodeVitA(x.tgl.slice(0, 7));
      const l = (d.vit[x.id] = (d.vit[x.id] || []).filter(v => !(v.jenis === x.jenis && v.periode === per)));
      l.push({ periode: per, jenis: x.jenis, tgl: x.tgl, id: x.id + '_' + x.jenis + '_' + per, _lokal: true });
      break; }
    case 'hapusVitamin':
      if (d.vit[x.id]) d.vit[x.id] = d.vit[x.id].filter(v => v.id !== x.idVit);
      break;
    case 'simpanBalita': {
      const data = { nama: String(x.nama).toUpperCase(), jk: x.jk, tglLahir: x.tglLahir, ayah: String(x.ayah || '').toUpperCase(),
        ibu: String(x.ibu || '').toUpperCase(), rt: x.rt, rw: x.rw, hp: x.hp, bbLahir: x.bbLahir, pbLahir: x.pbLahir, prematur: x.prematur,
        catatan: x.catatan, _lokal: true };
      if (x.posyandu) data.posyandu = x.posyandu;
      if (x.nik) data.nik = x.nik;
      if (x.kk) data.kk = x.kk;
      if (b) Object.assign(b, data);
      else {
        const baru = Object.assign({ id: x.id, posyandu: x.posyandu || (S.sesi && S.sesi.user.posyandu), status: 'Aktif',
          nik: x.nik || '', nikHash: '', kk: x.kk || '', tglMasuk: hariIni(), tglKeluar: '' }, data);
        d.balita.push(baru); d.byId[baru.id] = baru;
      }
      break; }
    case 'usulMutasi':
      if (!b) return;
      if (S.sesi && S.sesi.user.peran === 'admin') {
        b.status = x.jenis === 'Masuk' ? 'Aktif' : x.alasan === 'Meninggal' ? 'Meninggal' : 'Pindah';
        b.tglKeluar = x.jenis === 'Masuk' ? '' : x.tanggal;
      } else d.usulan.push({ ID_Balita: b.id, Jenis: x.jenis, Alasan: x.alasan, Tanggal: x.tanggal, Status: 'Diusulkan', _lokal: true });
      break;
    case 'simpanPeriksaLansia': {
      const l = d.lansiaById[x.id]; if (!l) return;
      const h = hitungLansia({ jk: l.jk, bb: x.bb, tb: x.tb, lp: x.lp, sistol: x.sistol, diastol: x.diastol, merokok: x.merokok, obat: x.obat, riwayatHT: l.rHT, riwayatDM: l.rDM });
      (d.periksaL[l.id] = d.periksaL[l.id] || {})[x.periode] = { id: l.id, periode: x.periode, tgl: x.tgl, bb: x.bb || '', tb: x.tb || '', imt: h.imt === null ? '' : h.imt,
        stIMT: h.stIMT, lp: x.lp || '', stLP: h.stLP, sistol: x.sistol || '', diastol: x.diastol || '', stTD: h.stTD, obat: x.obat, merokok: x.merokok,
        label: h.label, alasan: h.alasan.join('; '), diubahPada: '', petugas: S.sesi ? S.sesi.user.username : '', _lokal: true };
      break; }
    case 'hapusPeriksaLansia':
      if (d.periksaL[x.id]) delete d.periksaL[x.id][x.periode];
      break;
    case 'simpanLansia': {
      const l = d.lansiaById[x.id];
      const data = { nama: x.nama, jk: x.jk, tglLahir: x.tglLahir, rt: x.rt, rw: x.rw, dusun: x.dusun, hp: x.hp, rHT: x.rHT, rDM: x.rDM, catatan: x.catatan, _lokal: true };
      if (x.posyandu) data.posyandu = x.posyandu;
      if (x.nik) data.nik = x.nik;
      if (x.kk) data.kk = x.kk;
      if (l) Object.assign(l, data);
      else {
        const baru = Object.assign({ id: x.id, posyandu: x.posyandu || (S.sesi && S.sesi.user.posyandu), status: 'Aktif', nik: '', kk: '', tglMasuk: hariIni(), tglKeluar: '',
          usulKeluar: '', usulTanggal: '' }, data);
        d.lansia.push(baru); d.lansiaById[baru.id] = baru;
      }
      break; }
    case 'usulKeluarLansia': {
      const l = d.lansiaById[x.id]; if (!l) return;
      if (S.sesi && S.sesi.user.peran === 'admin') { l.status = x.alasan === 'Meninggal' ? 'Meninggal' : x.alasan === 'Pindah' ? 'Pindah' : 'Keluar'; l.tglKeluar = x.tanggal; }
      else { l.usulKeluar = x.alasan; l.usulTanggal = x.tanggal; }
      break; }
    case 'simpanKPSP':
      if (!b) return;
      (d.kpsp[x.id] = d.kpsp[x.id] || {})[x.usiaKpsp] = { usia: x.usiaKpsp, tgl: x.tgl, ya: x.jumlahYa, hasil: hasilKPSP(x.jumlahYa),
        tdd: x.tdd, tdl: x.tdl, catatan: x.catatan, _lokal: true };
      break;
    case 'laporPD3I': {
      if (!b) return;
      const lama = d.pd3i.find(z => z.idLapor === x.idLapor);
      const baru = Object.assign({}, lama || { pelapor: S.sesi ? S.sesi.user.username : '', tglLapor: hariIni(), imun: '' },
        { idLapor: x.idLapor, id: x.id, penyakit: x.penyakit, tglGejala: x.tglGejala, gejala: x.gejala, status: x.status || 'Dilaporkan', tl: x.tindakLanjut || '', _lokal: true });
      d.pd3i = d.pd3i.filter(z => z !== lama).concat([baru]);
      break; }
    case 'simpanTindakLanjut': {
      let t = d.tl.find(z => (x.idTL && z.ID === x.idTL) || (!x.idTL && z.ID_Balita === x.id && ['Belum', 'Sedang', 'Membaik'].indexOf(z.Status) >= 0));
      if (!t) { t = { ID: 'L-' + it.qid, ID_Balita: x.id, Tgl_Terdeteksi: hariIni(), Periode: periodeKini(), Label: x.label || 'Kuning', Alasan: x.alasan || '' }; d.tl.push(t); }
      Object.assign(t, { Tgl_Rujuk: x.tglRujuk, Dirujuk_Ke: x.dirujukKe, Hasil_Periksa: x.hasil, Intervensi: x.intervensi, Status: x.status, _lokal: true });
      break; }
  }
}

/* Balasan server untuk satu kiriman → perbarui S.dasar */
function terimaHasil(it, h) {
  const D = S.dasar, x = it.data;
  if (!D.kpsp) D.kpsp = {};
  if (!D.pd3i) D.pd3i = [];
  if (!D.lansia) D.lansia = [];
  if (!D.periksaL) D.periksaL = {};
  if (!D.kolPeriksaL) D.kolPeriksaL = KOL_PERIKSA_L;
  const masihAda = S.antrean.some(o => o !== it && o.kunci && o.kunci === it.kunci && o.status !== 'gagal');
  switch (it.action) {
    case 'simpanPengukuran':
      if (!masihAda) (D.ukur[x.id] = D.ukur[x.id] || {})[x.periode] = barisKeUkur(h.ukur);
      if (h.berikut) { const r = barisKeUkur(h.berikut); (D.ukur[x.id] = D.ukur[x.id] || {})[r.periode] = r; }
      if (h.tl) tlMasuk(D, h.tl);
      break;
    case 'hapusPengukuran':
      if (!masihAda && D.ukur[x.id]) delete D.ukur[x.id][x.periode];
      if (h.berikut) { const r = barisKeUkur(h.berikut); (D.ukur[x.id] = D.ukur[x.id] || {})[r.periode] = r; }
      break;
    case 'simpanImunisasi': if (!masihAda) (D.imun[h[0]] = D.imun[h[0]] || {})[h[1]] = { tgl: h[2], id: h[3], tempat: h[4] }; break;
    case 'hapusImunisasi': if (!masihAda && D.imun[x.id]) delete D.imun[x.id][x.kode]; break;
    case 'simpanVitamin': D.vit[h[0]] = (D.vit[h[0]] || []).filter(v => !(v.jenis === h[2] && v.periode === h[1])).concat([{ periode: h[1], jenis: h[2], tgl: h[3], id: h[4] }]); break;
    case 'hapusVitamin': if (D.vit[x.id]) D.vit[x.id] = D.vit[x.id].filter(v => v.id !== x.idVit); break;
    case 'simpanBalita': {
      let b = D.balita.find(z => z.id === h.id);
      if (!b) { b = { id: h.id, tglMasuk: hariIni(), tglKeluar: '', nikHash: '' }; D.balita.push(b); }
      const isi = { nama: String(x.nama).toUpperCase(), jk: x.jk, tglLahir: x.tglLahir, ayah: String(x.ayah || '').toUpperCase(), ibu: String(x.ibu || '').toUpperCase(),
        rt: x.rt, rw: x.rw, hp: x.hp, bbLahir: x.bbLahir, pbLahir: x.pbLahir, prematur: x.prematur, catatan: x.catatan, status: h.status,
        posyandu: x.posyandu || b.posyandu || S.sesi.user.posyandu };
      if (x.nik) isi.nik = S.sesi.user.peran === 'admin' ? x.nik : x.nik.slice(0, 4) + 'xxxxxxxx' + x.nik.slice(-4);
      if (x.kk) isi.kk = S.sesi.user.peran === 'admin' ? x.kk : x.kk.slice(0, 4) + 'xxxxxxxx' + x.kk.slice(-4);
      Object.assign(b, isi);
      break; }
    case 'usulMutasi':
      if (h.status === 'Disetujui') { const b = D.balita.find(z => z.id === x.id); if (b) { b.status = x.jenis === 'Masuk' ? 'Aktif' : x.alasan === 'Meninggal' ? 'Meninggal' : 'Pindah'; b.tglKeluar = x.jenis === 'Masuk' ? '' : x.tanggal; } }
      else D.usulan.push({ ID: h.idMutasi, ID_Balita: x.id, Jenis: x.jenis, Alasan: x.alasan, Tanggal: x.tanggal, Status: 'Diusulkan' });
      break;
    case 'simpanTindakLanjut': tlMasuk(D, h); break;
    case 'simpanPeriksaLansia':
      if (!masihAda) { const r = {}; D.kolPeriksaL.forEach((k, i) => { r[k] = h.periksa[i]; }); (D.periksaL[r.id] = D.periksaL[r.id] || {})[r.periode] = r; }
      break;
    case 'hapusPeriksaLansia': if (!masihAda && D.periksaL[x.id]) delete D.periksaL[x.id][x.periode]; break;
    case 'simpanLansia': {
      let l = D.lansia.find(z => z.id === h.id);
      if (!l) { l = { id: h.id, tglMasuk: hariIni(), tglKeluar: '', usulKeluar: '', usulTanggal: '' }; D.lansia.push(l); }
      Object.assign(l, { nama: x.nama, jk: x.jk, tglLahir: x.tglLahir, rt: x.rt, rw: x.rw, dusun: x.dusun, hp: x.hp, rHT: x.rHT, rDM: x.rDM, catatan: x.catatan,
        status: h.status, posyandu: x.posyandu || l.posyandu || S.sesi.user.posyandu });
      if (x.nik) l.nik = S.sesi.user.peran === 'admin' ? x.nik : x.nik.slice(0, 4) + 'xxxxxxxx' + x.nik.slice(-4);
      if (x.kk) l.kk = S.sesi.user.peran === 'admin' ? x.kk : x.kk.slice(0, 4) + 'xxxxxxxx' + x.kk.slice(-4);
      break; }
    case 'usulKeluarLansia': {
      const l = D.lansia.find(z => z.id === x.id);
      if (l && h.status === 'Disetujui') { l.status = x.alasan === 'Meninggal' ? 'Meninggal' : x.alasan === 'Pindah' ? 'Pindah' : 'Keluar'; l.tglKeluar = x.tanggal; }
      else if (l) { l.usulKeluar = x.alasan; l.usulTanggal = x.tanggal; }
      break; }
    case 'simpanKPSP': if (!masihAda) (D.kpsp[h[0]] = D.kpsp[h[0]] || {})[h[1]] = kpspObj(h); break;
    case 'laporPD3I': if (!masihAda) D.pd3i = D.pd3i.filter(z => z.idLapor !== h[0]).concat([pd3iObj(h)]); break;
  }
}
function tlMasuk(D, t) {
  D.tl = D.tl.filter(z => z.ID !== t.ID);
  D.tl.push(t);
}

async function simpanDasar() { if (S.dasar) await DB.set('dasar', S.dasar); }

async function sinkron(diam) {
  if (!S.sesi) return false;
  if (!diam) toast('Mengambil data terbaru…', 1500);
  const r = await api('sinkron', {}, { batas: 90000 });
  if (!r.ok) { if (!diam && !r.sesi) toast(r.pesan); perbaruiStatus(); return false; }
  S.dasar = olahData(r.data);
  S.sesi.user = r.data.user;
  await DB.set('sesi', S.sesi);
  await simpanDasar();
  susunData();
  if (diam) segarkan(); else render();
  if (!diam) toast('Data sudah terbaru.');
  return true;
}

/* ---------- Antrean kiriman ---------- */
function kunciAntrean(a, x) {
  if (a === 'simpanPengukuran' || a === 'hapusPengukuran') return 'ukur|' + x.id + '|' + x.periode;
  if (a === 'simpanImunisasi' || a === 'hapusImunisasi') return 'imun|' + x.id + '|' + x.kode;
  if (a === 'simpanVitamin') return 'vit|' + x.id + '|' + x.jenis + '|' + x.tgl.slice(0, 7);
  if (a === 'simpanBalita') return 'balita|' + x.id;
  if (a === 'simpanPeriksaLansia' || a === 'hapusPeriksaLansia') return 'pl|' + x.id + '|' + x.periode;
  if (a === 'simpanLansia') return 'lansia|' + x.id;
  if (a === 'simpanKPSP') return 'kpsp|' + x.id + '|' + x.usiaKpsp;
  if (a === 'laporPD3I') return 'pd3i|' + x.idLapor;
  return '';
}

async function antrekan(action, data, label) {
  const kunci = kunciAntrean(action, data);
  let it = kunci ? S.antrean.find(o => o.kunci === kunci && o.status !== 'kirim') : null;
  if (it) Object.assign(it, { action, data, label, status: 'menunggu', pesan: '', waktu: Date.now() });
  else {
    it = { qid: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), kunci, action, data, label, waktu: Date.now(),
           status: 'menunggu', user: S.sesi.user.username };
    S.antrean.push(it);
  }
  await DB.simpanAntrean(it);
  susunData();
  perbaruiStatus();
  setTimeout(kirimAntrean, 50);
  return it;
}

async function kirimAntrean() {
  if (S.kirim || !S.sesi) return;
  const siap = S.antrean.filter(o => o.status === 'menunggu' && o.user === S.sesi.user.username).sort((a, b) => a.waktu - b.waktu).slice(0, 40);
  if (!siap.length) return;
  S.kirim = true; siap.forEach(o => { o.status = 'kirim'; }); perbaruiStatus();
  let berhasil = 0;
  try {
    const r = await api('batch', null, { items: siap.map(o => ({ id: o.qid, action: o.action, data: o.data })), batas: 120000 });
    if (!r.ok) { siap.forEach(o => { o.status = 'menunggu'; }); if (!r.jaringan && !r.sesi) toast(r.pesan); S.online = !r.jaringan; return; }
    for (const h of r.data) {
      const it = S.antrean.find(o => o.qid === h.id);
      if (!it) continue;
      if (h.ok) {
        S.antrean = S.antrean.filter(o => o !== it);
        terimaHasil(it, h.data);
        await DB.hapusAntrean(it.qid);
        berhasil++;
      } else { it.status = 'gagal'; it.pesan = h.pesan; await DB.simpanAntrean(it); }
    }
    await simpanDasar();
  } finally {
    S.antrean.forEach(o => { if (o.status === 'kirim') o.status = 'menunggu'; });
    S.kirim = false;
    susunData();
    perbaruiStatus();
    if (berhasil) segarkan();
  }
  if (S.antrean.some(o => o.status === 'menunggu' && o.user === S.sesi.user.username) && S.online) setTimeout(kirimAntrean, 800);
  else if (S.antrean.some(o => o.status === 'gagal')) toast('Ada kiriman yang ditolak server. Lihat menu Antrean.', 4500);
}

function hitungAntrean() {
  const m = S.antrean.filter(o => o.status !== 'gagal').length, g = S.antrean.filter(o => o.status === 'gagal').length;
  return { m, g };
}

function perbaruiStatus() {
  const el = $('#statusKirim');
  if (!el) return;
  const { m, g } = hitungAntrean();
  el.className = 'status-kirim' + (g ? ' gagal' : m ? ' ada' : !S.online ? ' offline' : '');
  el.innerHTML = S.kirim ? '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Mengirim'
    : `<span class="titik"></span> ${g ? g + ' gagal' : m ? m + ' belum terkirim' : S.online ? 'Terkirim' : 'Offline'}`;
}

/* ---------- Sesi ---------- */
async function sesiBerakhir(pesan) {
  S.sesi = null;
  await DB.del('sesi');
  S.galatLogin = (pesan || 'Sesi berakhir.') + ' Data yang belum terkirim tetap aman di HP ini.';
  location.hash = '#/login';
  render();
}

async function keluar() {
  const { m, g } = hitungAntrean();
  if (m + g) { toast('Masih ada ' + (m + g) + ' data belum terkirim. Kirim dulu sebelum keluar.', 4500); location.hash = '#/antrean'; return; }
  if (!await konfirmasi('Keluar dari aplikasi?', 'Data di HP ini akan dihapus. Login lagi untuk mengambil data.', 'Keluar', true)) return;
  api('logout', {});
  await DB.kosongkan();
  S.sesi = null; S.dasar = null; S.d = null; S.antrean = [];
  location.hash = '#/login';
  render();
}

/* ---------- Kumpulan data turunan ---------- */
const admin = () => S.sesi && S.sesi.user.peran === 'admin';
function bisaUbahPeriode(p) {
  if (admin()) return { ok: true };
  if (p < geserPeriode(periodeKini(), -1)) return { ok: false, pesan: 'Kader hanya bisa mengubah bulan ini dan bulan lalu.' };
  if (p > periodeKini()) return { ok: false, pesan: 'Periode belum berjalan.' };
  if ((S.d.kunci || []).indexOf(p) >= 0) return { ok: false, pesan: namaPeriode(p) + ' sudah dikunci admin.' };
  return { ok: true };
}
function posTerpilih(b) { return !admin() || !S.pos || b.posyandu === S.pos; }
/* Sasaran periode p: aktif/menunggu, sudah lahir, belum 60 bulan. pos = posyandu tertentu (pantauan admin) */
function sasaran(p, pos) {
  const akhir = akhirPeriode(p);
  return S.d.balita.filter(b => (b.status === 'Aktif' || b.status === 'Menunggu') && b.tglLahir && b.tglLahir <= akhir &&
    usiaBulan(b.tglLahir, awalPeriode(p)) < 60 && (pos === undefined ? posTerpilih(b) : b.posyandu === pos));
}
const ukurDi = (id, p) => (S.d.ukur[id] || {})[p] || null;
function ukurTerakhir(id) {
  const u = S.d.ukur[id] || {}, ps = Object.keys(u).sort();
  return ps.length ? u[ps[ps.length - 1]] : null;
}
function statusImun(b) {
  const usia = usiaBulan(b.tglLahir, hariIni());
  const diberi = {};
  Object.keys(S.d.imun[b.id] || {}).forEach(k => { diberi[k] = S.d.imun[b.id][k].tgl; });
  return { usia, list: statusImunisasi(usia, S.d.jadwal, diberi), idl: imunisasiDasarLengkap(S.d.jadwal, diberi) };
}
function vitASudah(b, perVit) { return (S.d.vit[b.id] || []).some(v => v.periode === perVit && v.jenis.indexOf('VitA') === 0); }
function tlTerbuka(id) { return S.d.tl.filter(t => t.ID_Balita === id && ['Belum', 'Sedang', 'Membaik'].indexOf(t.Status) >= 0).pop() || null; }

function daftarRisiko() {
  const P = periodeKini(), P1 = geserPeriode(P, -1), out = { Merah: [], Kuning: [], Absen: [] };
  sasaran(P).forEach(b => {
    const u = ukurDi(b.id, P) || ukurDi(b.id, P1);
    const si = statusImun(b);
    const bbl = gramLahir(b.bbLahir), pbl = bacaAngka(b.pbLahir);
    const skor = skorRisiko({ bbLahir: isNaN(bbl) ? '' : bbl, pbLahir: isNaN(pbl) ? '' : pbl, prematur: b.prematur, imunTerlambat: si.list.some(x => x.status === 'Terlambat'),
      vitATidak: si.usia >= 6 && !vitASudah(b, periodeVitA(P)), nt: u ? u.nt : '', zTBU: u ? kosongNull(u.zTBU) : null });
    const t = tlTerbuka(b.id);
    if (u && (u.label === 'Merah' || u.label === 'Kuning')) out[u.label].push({ b, u, skor, t });
    else if (!u) {
      const lama = ukurTerakhir(b.id);
      if (lama && lama.periode < geserPeriode(P, -1)) out.Absen.push({ b, u: lama, skor, t });
    }
  });
  out.Merah.sort((a, b) => b.skor - a.skor); out.Kuning.sort((a, b) => b.skor - a.skor);
  return out;
}

/* =====================================================================
   TAMPILAN
   ===================================================================== */
const NAV = [['beranda', 'Beranda', 'rumah'], ['imunisasi', 'Imunisasi', 'suntik'], ['ukur', 'Ukur', 'ukur'], ['risiko', 'Risiko', 'awas'], ['menu', 'Menu', 'menu']];

function rute() { const h = (location.hash || '#/beranda').slice(2).split('/'); return { hal: h[0] || 'beranda', arg: decodeURIComponent(h[1] || '') }; }

/* y = posisi gulir yang dipulihkan setelah layar digambar ulang (bawaan: posisi sekarang),
   supaya sinkron di latar atau menutup lembar tidak melempar daftar kembali ke atas. */
function render(y = window.scrollY) {
  const app = $('#app'), r = rute();
  if (!S.sesi) { app.innerHTML = viewLogin(); return; }
  if (!S.d) {
    app.innerHTML = `<div class="halaman-muat"><div class="muat"><div class="spinner gelap"></div> Mengambil data balita…</div>
      <p class="redup kecil" style="text-align:center">Pengambilan data pertama perlu sinyal internet.</p>
      <button class="tombol garis penuh" data-aksi="sinkron">Coba lagi</button></div>`;
    return;
  }
  const V = VIEWS[r.hal] || VIEWS.beranda;
  const v = V(r.arg);
  const utama = NAV.some(n => n[0] === r.hal);
  // Halaman turunan (profil, form, dll.) tetap menyorot tab asal, agar sorotan tidak melompat
  if (utama) S.tabNav = r.hal;
  const navAktif = utama ? r.hal : (S.tabNav || v.nav);
  const jmlRisiko = (() => { try { return daftarRisiko().Merah.filter(x => !x.t || x.t.Status === 'Belum').length; } catch (e) { return 0; } })();
  app.innerHTML = `
    ${v.hero ? '<div class="beranda-latar"></div>' : ''}
    <header class="atas${v.hero ? ' beranda' : ''}">
      ${utama ? '' : `<button class="kembali" data-aksi="kembali" aria-label="Kembali">${ikon('kembali')}</button>`}
      <h1>${esc(v.judul)}</h1>
      <button id="statusKirim" class="status-kirim" data-aksi="ke" data-ke="antrean"></button>
    </header>
    <main>${v.html}</main>
    <nav class="bawah">${NAV.map(n => `<button class="${navAktif === n[0] ? 'aktif' : ''}${n[0] === 'ukur' ? ' tengah' : ''}" data-aksi="ke" data-ke="${n[0]}"${navAktif === n[0] ? ' aria-current="page"' : ''}>${n[0] === 'ukur' ? `<span class="fab">${ikon(n[2], 26)}</span>` : `<span class="ik">${ikon(n[2], 23)}</span>`}<span>${n[1]}</span>
      ${n[0] === 'risiko' && jmlRisiko ? `<span class="bdg">${jmlRisiko}</span>` : ''}</button>`).join('')}</nav>`;
  perbaruiStatus();
  if (v.setelah) v.setelah();
  gulirKe(y);
}
/* Daftar balita diisi sesudah render (async); bila halaman sempat terlalu pendek, ulangi sekali */
function gulirKe(y) {
  window.scrollTo(0, y);
  if (y) setTimeout(() => { if (window.scrollY < y - 2) window.scrollTo(0, y); }, 40);
}

/* Perbarui layar tanpa mengganggu kader yang sedang mengetik */
function segarkan() {
  if ($('#tirai')) { perbaruiStatus(); return; }
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) {
    perbaruiStatus();
    if ($('#daftarUkur')) isiDaftarUkur();
    if ($('#daftarB')) isiDataBalita();
    if ($('#daftarL')) isiDaftarLansia();
    return;
  }
  render();
}

/* ---------- Login ---------- */
function viewLogin() {
  return `<div class="halaman-login">
    <div class="login-atas">
      <img class="logo-besar" src="icons/icon-192.png" alt="">
      <h1>${esc(C.NAMA)}</h1>
      <p>Pemantauan pertumbuhan balita ${esc(C.DESA)}</p>
    </div>
    <div class="login-kartu">
    <h2 style="margin:0 0 14px;font-size:1.1rem">Masuk ke akun Anda</h2>
    ${S.galatLogin ? `<div class="pesan-awas">${esc(S.galatLogin)}</div>` : ''}
    <form id="fLogin" autocomplete="on">
      <label class="isian"><span>Username</span><input name="username" autocapitalize="none" autocomplete="username" required></label>
      <label class="isian"><span>PIN</span><input name="pin" type="password" inputmode="numeric" autocomplete="current-password" required></label>
      <div id="galat"></div>
      <button class="tombol penuh" type="submit">Masuk</button>
    </form>
    </div>
    <div class="login-bawah">
    ${S.pasang ? `<button class="tombol garis penuh" data-aksi="pasang">${ikon('awan', 20)} Pasang aplikasi di HP</button>` : ''}
    <p class="redup kecil" style="text-align:center;margin-top:20px">Lupa PIN? Hubungi admin desa · Versi ${esc(C.VERSI)}</p>
    </div>
  </div>`;
}

async function kirimLogin(f) {
  const tombol = f.querySelector('button[type=submit]');
  tombol.disabled = true; tombol.innerHTML = '<span class="spinner"></span> Masuk…';
  const r = await api('login', { username: f.username.value.trim().toLowerCase(), pin: f.pin.value.trim(), perangkat: navigator.userAgent.slice(0, 100) });
  if (!r.ok) { $('#galat').innerHTML = `<div class="pesan-galat">${esc(r.pesan)}</div>`; tombol.disabled = false; tombol.textContent = 'Masuk'; return; }
  const lama = await DB.get('sesi');
  S.sesi = { token: r.data.token, user: r.data.user, kedaluwarsa: r.data.kedaluwarsa };
  await DB.set('sesi', S.sesi);
  S.galatLogin = '';
  if (S.dasar && lama && lama.user && lama.user.username !== r.data.user.username) { S.dasar = null; await DB.del('dasar'); }
  location.hash = '#/beranda';
  render();
  await kirimAntrean();
  await sinkron(true);
}

/* ---------- Beranda ---------- */
function pilihPosyandu() {
  if (!admin()) return '';
  return `<label class="isian"><span>Posyandu</span><select data-ubah="pos">
    <option value="">Semua posyandu</option>${S.d.posyandu.map(p => `<option ${S.pos === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>`;
}

function viewBeranda() {
  const u = S.d.user, P = periodeKini(), sas = sasaran(P), sudah = sas.filter(b => ukurDi(b.id, P)).length;
  const pct = sas.length ? Math.round(sudah / sas.length * 100) : 0;
  const ris = daftarRisiko();
  const imunJT = sas.filter(b => statusImun(b).list.some(x => x.status === 'Jatuh tempo' || x.status === 'Terlambat')).length;
  const { m, g } = hitungAntrean();
  const menunggu = admin() ? S.d.balita.filter(b => b.status === 'Menunggu').length + S.d.usulan.filter(x => x.Status === 'Diusulkan').length : 0;
  const menitSinkron = Math.round((Date.now() - (S.dasar.waktuSinkron || 0)) / 60000);
  const jam = new Date().getHours();
  const salam = jam < 4 ? 'Selamat malam' : jam < 11 ? 'Selamat pagi' : jam < 15 ? 'Selamat siang' : jam < 18 ? 'Selamat sore' : 'Selamat malam';
  const bdg = n => n ? `<span class="bdg">${n > 99 ? '99+' : n}</span>` : '';
  const tombolBulat = (aksi, ke, warna, ik, teks, n) => `<button data-aksi="${aksi}" data-ke="${ke}"><span class="bulat ${warna}">${ikon(ik, 24)}</span>${teks}${bdg(n)}</button>`;
  const layanan = [
    ['ke', 'imunisasi', 'w-biru', 'suntik', 'Imunisasi'],
    ['keVitA', '', 'w-oranye', 'kapsul', 'Vitamin A'],
    ['ke', 'risiko', 'w-merah', 'awas', 'Risiko'],
    ['ke', 'lansia', 'w-hijau', 'orang', 'Lansia'],
    ['ke', 'data-balita', 'w-tosca', 'orang', 'Data balita'],
    ['ke', 'tambah-balita', 'w-pink', 'bayi', 'Tambah balita'],
    ['ke', 'antrean', 'w-ungu', 'awan', 'Antrean', m + g],
    ['ke', 'akun', 'w-abu', 'gembok', 'Ganti PIN'],
    ['ke', 'menu', 'w-hijau', 'menu', 'Lainnya']
  ];
  const layananAdmin = [
    ['ke', 'pantau', 'w-tosca', 'papan', 'Pantau timbang'],
    ['ke', 'dashboard', 'w-biru', 'batang', 'Dashboard'],
    ['ke', 'persetujuan', 'w-kuning', 'setuju', 'Persetujuan', menunggu],
    ['ke', 'laporan', 'w-hijau', 'dokumen', 'Laporan Excel'],
    ['ke', 'pengguna', 'w-ungu', 'akun', 'Akun kader'],
    ['ke', 'kunci', 'w-abu', 'gembok', 'Kunci periode']
  ];
  return { judul: C.NAMA, hero: true, html: `
    <div class="hero">
      <div class="salam">${salam},</div>
      <div class="nama">${esc(u.nama)}</div>
      <div class="peran">${ikon(u.peran === 'admin' ? 'akun' : 'rumah', 15)} ${u.peran === 'admin' ? 'Admin ' + esc(S.d.desa) : 'Kader Posyandu ' + esc(u.posyandu)}</div>
      ${admin() ? `<select data-ubah="pos" aria-label="Posyandu"><option value="">Semua posyandu</option>${S.d.posyandu.map(p => `<option ${S.pos === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>` : ''}
    </div>
    <div class="hero-kartu">
      <div class="baris antara"><span class="label-kecil">Penimbangan ${esc(namaPeriode(P))}</span><span class="persen">${pct}%</span></div>
      <div class="besar">${sudah} <small>/ ${sas.length} balita</small></div>
      <div class="progres"><i style="width:${pct}%"></i></div>
      <div class="redup kecil">${sas.length - sudah ? (sas.length - sudah) + ' balita belum diukur bulan ini' : 'Semua balita sudah diukur. Terima kasih!'}</div>
      <div class="aksi-cepat">
        ${tombolBulat('ke', 'ukur', 'w-biru', 'ukur', 'Ukur')}
        ${tombolBulat('ke', 'tambah-balita', 'w-pink', 'tambah', 'Tambah')}
        ${tombolBulat('sinkron', '', 'w-tosca', 'segar', 'Sinkron')}
        ${tombolBulat('ke', 'antrean', 'w-ungu', 'awan', 'Antrean', m + g)}
      </div>
    </div>
    ${S.swBaru ? `<div class="banner biru"><span class="bulat w-biru" style="width:40px;height:40px;border-radius:13px;display:grid;place-items:center;color:#fff">${ikon('segar', 20)}</span><div class="isi"><b>Versi baru tersedia</b><div class="kecil">Perbarui untuk memakai perbaikan terbaru.</div></div><button class="tombol kecil" data-aksi="perbaruiApp">Perbarui</button></div>` : ''}
    ${S.pasang ? `<div class="banner biru"><span class="bulat w-tosca" style="width:40px;height:40px;border-radius:13px;display:grid;place-items:center;color:#fff">${ikon('awan', 20)}</span><div class="isi"><b>Pasang di layar HP</b><div class="kecil">Agar cukup mengetuk ikon.</div></div><button class="tombol kecil" data-aksi="pasang">Pasang</button></div>` : ''}
    ${pd3iAktif().length ? `<div class="pesan-galat"><b>${pd3iAktif().length} suspek PD3I aktif.</b> <a href="#/risiko">Lihat</a> — pastikan sudah diteruskan ke Puskesmas.</div>` : ''}
    ${g ? `<div class="pesan-galat">${g} kiriman ditolak server. <a href="#/antrean">Periksa</a></div>` : m ? `<div class="pesan-awas">${m} data belum terkirim. Akan terkirim otomatis saat ada sinyal.</div>` : ''}
    ${(() => { const sl = sasaranLansia(), sd = sl.filter(l => periksaDi(l.id, P)).length, pl = sl.length ? Math.round(sd / sl.length * 100) : 0;
      return sl.length ? `<button class="kartu" data-aksi="ke" data-ke="lansia" style="display:block;width:100%;text-align:left;border:0;cursor:pointer">
        <div class="baris antara"><span class="label-kecil">Pemeriksaan lansia ${esc(namaPeriode(P))}</span><span class="persen">${pl}%</span></div>
        <div class="besar">${sd} <small>/ ${sl.length} lansia</small></div><div class="progres"><i style="width:${pl}%"></i></div>
        <div class="redup kecil">${sl.length - sd ? (sl.length - sd) + ' lansia belum diperiksa bulan ini' : 'Semua lansia sudah diperiksa.'}</div></button>` : ''; })()}
    <div class="judul-bagian">Perlu perhatian</div>
    <div class="grid2">
      <button class="ubin merah" data-aksi="ke" data-ke="risiko"><span class="ik">${ikon('awas', 22)}</span><span><b>${ris.Merah.length}</b><span>Perlu rujukan</span></span></button>
      <button class="ubin kuning" data-aksi="ke" data-ke="risiko"><span class="ik">${ikon('jam', 22)}</span><span><b>${ris.Kuning.length}</b><span>Waspada</span></span></button>
      <button class="ubin biru" data-aksi="ke" data-ke="imunisasi"><span class="ik">${ikon('suntik', 22)}</span><span><b>${imunJT}</b><span>Jatuh tempo imunisasi</span></span></button>
      <button class="ubin ungu" data-aksi="ke" data-ke="risiko"><span class="ik">${ikon('orang', 22)}</span><span><b>${ris.Absen.length}</b><span>Tidak ditimbang ≥ 2 bln</span></span></button>
    </div>
    <div class="judul-bagian">Layanan</div>
    <div class="layanan">${layanan.map(x => tombolBulat(x[0], x[1], x[2], x[3], x[4], x[5])).join('')}</div>
    ${admin() ? `<div class="judul-bagian">Admin desa</div><div class="layanan">${layananAdmin.map(x => tombolBulat(x[0], x[1], x[2], x[3], x[4], x[5])).join('')}</div>` : ''}
    <p class="info-sinkron">Sinkron terakhir: ${menitSinkron < 1 ? 'baru saja' : menitSinkron < 60 ? menitSinkron + ' menit lalu' : fmtTgl(String(S.dasar.waktu).slice(0, 10))}</p>` };
}

/* ---------- Ukur ---------- */
function opsiPeriode() {
  const P = periodeKini(), n = admin() ? 24 : 2, out = [];
  for (let i = 0; i < n; i++) out.push(geserPeriode(P, -i));
  return out;
}

function viewUkur() {
  if (!S.periode) S.periode = periodeKini();
  const ps = opsiPeriode();
  if (ps.indexOf(S.periode) < 0) S.periode = ps[0];
  const boleh = bisaUbahPeriode(S.periode);
  return { judul: 'Ukur ' + namaPeriode(S.periode), html: `
    ${admin() ? `<div class="grid2"><label class="isian"><span>Periode</span><select data-ubah="periode">${ps.map(p => `<option value="${p}" ${p === S.periode ? 'selected' : ''}>${namaPeriode(p)}</option>`).join('')}</select></label>${pilihPosyandu()}</div>`
      : `<div class="chips">${ps.map(p => `<button class="chip ${p === S.periode ? 'aktif' : ''}" data-aksi="periode" data-p="${p}">${namaPeriode(p)}</button>`).join('')}</div>`}
    ${boleh.ok ? '' : `<div class="pesan-awas">${esc(boleh.pesan)} Data hanya bisa dilihat.</div>`}
    <div class="cari">${ikon('cari', 20)}<input id="cari" type="search" placeholder="Cari nama, nama ibu, atau NIK" value="${esc(S.cari)}" autocomplete="off"></div>
    <div class="chips">${[['belum', 'Belum diukur'], ['sudah', 'Sudah diukur'], ['semua', 'Semua']].map(f => `<button class="chip ${S.filterUkur === f[0] ? 'aktif' : ''}" data-aksi="filterUkur" data-f="${f[0]}">${f[1]}</button>`).join('')}</div>
    <div id="daftarUkur"></div>`,
    setelah: () => { isiDaftarUkur(); const c = $('#cari'); c.addEventListener('input', () => { S.cari = c.value; isiDaftarUkur(); }); } };
}

async function cocokCari(list, q) {
  q = rapiSpasi(q).toLowerCase();
  if (!q) return list;
  const angkaSaja = q.replace(/\D/g, '');
  let h16 = '';
  // NIK boleh diketik dengan spasi/titik, mis. 3304 0112 3456 0001
  if (/^[\d\s.-]+$/.test(q) && angkaSaja.length === 16) h16 = await sha12(angkaSaja);
  return list.filter(b => (b.nama || '').toLowerCase().indexOf(q) >= 0 || (b.ibu || '').toLowerCase().indexOf(q) >= 0 ||
    (b.ayah || '').toLowerCase().indexOf(q) >= 0 || (h16 && b.nikHash === h16) || (angkaSaja.length >= 4 && String(b.nik || '').indexOf(angkaSaja) >= 0));
}

async function isiDaftarUkur() {
  const el = $('#daftarUkur'); if (!el) return;
  const p = S.periode;
  let list = sasaran(p).sort(urutNama);
  const total = list.length, sudah = list.filter(b => ukurDi(b.id, p)).length;
  if (S.filterUkur === 'belum') list = list.filter(b => !ukurDi(b.id, p));
  if (S.filterUkur === 'sudah') list = list.filter(b => ukurDi(b.id, p));
  list = await cocokCari(list, S.cari);
  el.innerHTML = `<p class="redup kecil" style="margin:0 4px 8px">${sudah} dari ${total} sudah diukur · ${list.length} ditampilkan</p>` + (list.length ? `<div class="daftar">${list.slice(0, 300).map(b => {
    const u = ukurDi(b.id, p);
    return `<button class="item" data-aksi="formUkur" data-id="${esc(b.id)}">
      <span class="avatar ${b.jk}">${esc(inisial(b.nama))}</span>
      <span class="isi"><div class="nama">${esc(b.nama)}</div><div class="sub">${usiaTeks(usiaBulan(b.tglLahir, akhirPeriode(p) > hariIni() ? hariIni() : akhirPeriode(p)))} · Ibu ${esc(b.ibu || '–')} · ${rtRw(b)}${admin() && !S.pos ? ' · ' + esc(b.posyandu) : ''}</div></span>
      ${u ? `<span class="lbl ${u.label}">${u.label}</span><span class="centang ${u._lokal ? 'lokal' : 'sudah'}">${ikon(u._lokal ? 'jam' : 'centang', 18)}</span>` : '<span class="centang belum"></span>'}
    </button>`; }).join('')}</div>` : `<div class="kosong">${S.filterUkur === 'belum' && !S.cari ? 'Semua balita sudah diukur. Terima kasih!' : 'Tidak ada balita yang cocok.'}</div>`);
}

function formUkur(id, periode) {
  const b = S.d.byId[id]; if (!b) return;
  periode = periode || S.periode || periodeKini();
  const u = ukurDi(id, periode), boleh = bisaUbahPeriode(periode);
  const lalu = ukurDi(id, geserPeriode(periode, -1)) || (() => { const t = ukurTerakhir(id); return t && t.periode < periode ? t : null; })();
  const tglDefault = u ? u.tglUkur : (periode === periodeKini() ? hariIni() : akhirPeriode(periode));
  const maxTgl = akhirPeriode(periode) > hariIni() ? hariIni() : akhirPeriode(periode);
  const usia = usiaBulan(b.tglLahir, tglDefault);
  const cara = u && u.cara ? u.cara : (usia < 24 ? 'Berbaring' : 'Berdiri');
  const hint = (k, sat) => lalu && lalu[k] !== '' ? `<div class="lalu">Bulan ${namaPeriode(lalu.periode).split(' ')[0]}: ${angka(lalu[k])} ${sat}</div>` : '';
  const dis = boleh.ok ? '' : 'disabled';
  bukaLembar(`
    <h3>${esc(b.nama)}</h3>
    <div class="redup kecil" style="margin-bottom:12px">${b.jk === 'L' ? 'Laki-laki' : 'Perempuan'} · ${usiaTeks(usia)} · Ibu ${esc(b.ibu || '–')} · ${namaPeriode(periode)}</div>
    ${boleh.ok ? '' : `<div class="pesan-awas">${esc(boleh.pesan)}</div>`}
    ${u ? `<div class="pesan-info">Data ${namaPeriode(periode)} sudah ada${u._lokal ? ' (belum terkirim)' : ''}. Ubah angka lalu tekan Perbarui.</div>` : ''}
    <form id="fUkur" data-id="${esc(id)}" data-periode="${periode}" data-ada="${u ? 1 : 0}" data-base="${u ? esc(u.diubahPada || '') : ''}">
      <label class="isian"><span>Tanggal ukur</span><input type="date" name="tglUkur" value="${tglDefault}" min="${awalPeriode(periode)}" max="${maxTgl}" required ${dis}></label>
      <div class="grid2">
        <label class="isian"><span>Berat badan</span><div class="isian-angka"><input name="bb" inputmode="decimal" enterkeyhint="next" value="${u ? esc(angka(u.bb).replace('–', '')) : ''}" placeholder="0,0" ${dis}><em>kg</em></div>${hint('bb', 'kg')}</label>
        <label class="isian"><span>${usia < 24 ? 'Panjang' : 'Tinggi'} badan</span><div class="isian-angka"><input name="tb" inputmode="decimal" enterkeyhint="next" value="${u ? esc(angka(u.tb).replace('–', '')) : ''}" placeholder="0,0" ${dis}><em>cm</em></div>${hint('tb', 'cm')}</label>
      </div>
      <label class="isian"><span>Cara ukur panjang/tinggi</span><select name="cara" ${dis}>
        <option value="Berbaring" ${cara === 'Berbaring' ? 'selected' : ''}>Berbaring (anjuran usia &lt; 2 tahun)</option>
        <option value="Berdiri" ${cara === 'Berdiri' ? 'selected' : ''}>Berdiri (anjuran usia ≥ 2 tahun)</option></select></label>
      <div class="grid2">
        <label class="isian"><span>Lingkar lengan (LiLA)</span><div class="isian-angka"><input name="lila" inputmode="decimal" enterkeyhint="next" value="${u ? esc(angka(u.lila).replace('–', '')) : ''}" placeholder="${usia < 6 ? '≥ 6 bln' : '0,0'}" ${dis}><em>cm</em></div>${hint('lila', 'cm')}</label>
        <label class="isian"><span>Lingkar kepala</span><div class="isian-angka"><input name="lk" inputmode="decimal" enterkeyhint="done" value="${u ? esc(angka(u.lk).replace('–', '')) : ''}" placeholder="0,0" ${dis}><em>cm</em></div>${hint('lk', 'cm')}</label>
      </div>
      <div id="galatUkur"></div>
      ${boleh.ok ? `<button class="tombol penuh" type="submit">${u ? 'Perbarui' : 'Simpan'}</button>
      <div class="deret-tombol" style="margin-top:10px">
        ${u ? `<button type="button" class="tombol bahaya" data-aksi="hapusUkur">Hapus</button>` : ''}
        <button type="button" class="tombol garis" data-aksi="tutup">Batal</button>
        <button type="button" class="tombol garis" data-aksi="ke" data-ke="balita/${esc(id)}">Profil</button></div>`
      : `<div class="deret-tombol"><button type="button" class="tombol garis" data-aksi="tutup">Tutup</button><button type="button" class="tombol garis" data-aksi="ke" data-ke="balita/${esc(id)}">Profil</button></div>`}
    </form>`, el => { const i = el.querySelector('input[name=bb]'); if (i && !i.value && boleh.ok) setTimeout(() => i.focus(), 250); });
}

async function simpanUkur(f) {
  const id = f.dataset.id, periode = f.dataset.periode, b = S.d.byId[id];
  const x = { id, periode, tglUkur: f.tglUkur.value, cara: f.cara.value, base: f.dataset.base || '' };
  const nama = { bb: 'Berat badan', tb: 'Panjang/tinggi badan', lila: 'Lingkar lengan', lk: 'Lingkar kepala' };
  for (const k of Object.keys(nama)) {
    const n = bacaAngka(f[k].value);
    if (Number.isNaN(n)) { $('#galatUkur').innerHTML = `<div class="pesan-galat">${nama[k]} harus berupa angka, contoh ${k === 'bb' ? '8,5' : '72,4'}.</div>`; return; }
    x[k] = n === '' ? 0 : n;
  }
  const err = validasiUkur(x, b.tglLahir);
  if (err) { $('#galatUkur').innerHTML = `<div class="pesan-galat">${esc(err)}</div>`; return; }
  if (usiaBulan(b.tglLahir, x.tglUkur) > 60) { $('#galatUkur').innerHTML = `<div class="pesan-galat">Usia sudah lebih dari 60 bulan.</div>`; return; }
  const lalu = ukurDi(id, geserPeriode(periode, -1));
  const w = peringatanUkur(x, lalu);
  // Nilai di luar batas kewajaran WHO (salah ketik, mis. 12,4 untuk bayi 2 bulan atau kg tertukar cm)
  const g = hitungGizi({ jk: b.jk, tglLahir: b.tglLahir, tglUkur: x.tglUkur, bb: x.bb, tb: x.tb, cara: x.cara, lila: x.lila, lk: x.lk });
  const aneh = [['zBBU', -6, 5, 'Berat badan menurut umur'], ['zTBU', -6, 6, 'Tinggi badan menurut umur'], ['zBBTB', -5, 5, 'Berat menurut tinggi'], ['zLKU', -5, 5, 'Lingkar kepala']]
    .filter(([k, lo, hi]) => g[k] !== null && g[k] !== undefined && (g[k] < lo || g[k] > hi)).map(a => a[3] + ' sangat tidak wajar untuk usia ' + usiaTeks(g.usiaBln) + '.');
  w.unshift(...aneh);
  if (w.length && !await konfirmasi('Periksa kembali angkanya', w.map(esc).join('<br>') + '<br><br>Apakah angka sudah benar?', 'Ya, tetap simpan')) return;
  await antrekan('simpanPengukuran', x, 'Ukur ' + b.nama + ' (' + namaPeriode(periode) + ')');
  const u = ukurDi(id, periode);
  tampilHasil(b, u);
}

function tampilHasil(b, u) {
  const p = u.periode;
  const berikut = sasaran(p).filter(z => !ukurDi(z.id, p) && z.id !== b.id).sort(urutNama)
    .find(z => urutNama(z, b) > 0) || sasaran(p).find(z => !ukurDi(z.id, p));
  const baris = (n, z, st) => st ? `<tr><td>${n}</td><td class="angka-sel">${z === '' || z === null ? '–' : angka(z)}</td><td>${esc(st)}</td></tr>` : '';
  bukaLembar(`
    <h3>${esc(b.nama)}</h3><div class="redup kecil" style="margin-bottom:12px">Tersimpan ${S.online ? '' : '(akan dikirim saat ada sinyal)'} · ${namaPeriode(p)}</div>
    <div class="hasil ${u.label}"><div class="baris antara"><b>${u.label === 'Merah' ? 'Perlu rujukan' : u.label === 'Kuning' ? 'Waspada' : 'Normal'}</b><span class="lbl ${u.label}">${u.label}</span></div>
      ${u.alasan ? `<ul>${u.alasan.split('; ').map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '<div class="kecil">Pertumbuhan sesuai standar.</div>'}</div>
    <table><tr><th>Indikator</th><th class="angka-sel">z-score</th><th>Status</th></tr>
      ${baris('BB/U', u.zBBU, u.stBBU)}${baris('TB/U', u.zTBU, u.stTBU)}${baris('BB/TB', u.zBBTB, u.stBBTB)}${baris('LK/U', u.zLKU, u.stLKU)}
      ${u.stLILA ? `<tr><td>LiLA</td><td class="angka-sel">${angka(u.lila)} cm</td><td>${esc(u.stLILA)}</td></tr>` : ''}
      ${u.nt ? `<tr><td>Naik BB</td><td class="angka-sel">${u.selisih !== '' ? angka(u.selisih) + ' g' : ''}</td><td>${{ N: 'Naik', T: 'Tidak naik', O: 'Bulan lalu tidak ditimbang', B: 'Baru pertama ditimbang' }[u.nt] || ''}</td></tr>` : ''}
    </table>
    <p class="redup kecil">Status bersifat penanda; penentuan dan penanganan oleh tenaga kesehatan.${u.label === 'Merah' ? ' Sampaikan ke orang tua dan catat rujukan di menu Risiko.' : ''}</p>
    <div class="deret-tombol">
      ${berikut ? `<button class="tombol" data-aksi="formUkur" data-id="${esc(berikut.id)}">Berikutnya: ${esc(berikut.nama.split(' ').slice(0, 2).join(' '))} ${ikon('kanan', 18)}</button>` : ''}
      <button class="tombol garis" data-aksi="tutupRender">Selesai</button></div>`);
}

/* ---------- Profil balita ---------- */
function viewBalita(id) {
  const b = S.d.byId[id];
  if (!b) return { judul: 'Balita', html: '<div class="kosong">Data balita tidak ditemukan.</div>' };
  const P = periodeKini(), si = statusImun(b), t = ukurTerakhir(id), tl = S.d.tl.filter(x => x.ID_Balita === id);
  const rows = Object.values(S.d.ukur[id] || {}).sort((a, c) => a.periode < c.periode ? 1 : -1);
  const vit = (S.d.vit[id] || []).slice().sort((a, c) => a.tgl < c.tgl ? 1 : -1);
  const usulan = S.d.usulan.filter(x => x.ID_Balita === id && x.Status === 'Diusulkan');
  const aktif = b.status === 'Aktif' || b.status === 'Menunggu';
  const ket = (k, v) => `<tr><td class="redup">${k}</td><td>${v}</td></tr>`;
  return { judul: b.nama, nav: 'ukur', html: `
    <div class="kartu">
      <div class="baris"><span class="avatar ${b.jk}" style="width:52px;height:52px;font-size:1.1rem">${esc(inisial(b.nama))}</span>
        <div style="flex:1"><div style="font-weight:700;font-size:1.1rem">${esc(b.nama)}</div>
        <div class="redup kecil">${b.jk === 'L' ? 'Laki-laki' : 'Perempuan'} · ${usiaTeks(usiaBulan(b.tglLahir, hariIni()))} · ${esc(b.posyandu)}</div></div>
        <span class="lbl ${b.status === 'Aktif' ? 'Hijau' : b.status === 'Menunggu' ? 'Kuning' : 'Abu'}">${esc(b.status)}</span></div>
      ${b.status === 'Menunggu' ? '<div class="pesan-info" style="margin-top:12px">Menunggu persetujuan admin. Pengukuran tetap bisa dicatat.</div>' : ''}
      ${usulan.length ? `<div class="pesan-awas" style="margin-top:12px">Diusulkan keluar (${esc(usulan[0].Alasan)}), menunggu persetujuan admin.</div>` : ''}
      <div class="tabel-wrap"><table style="margin-top:8px">
        ${ket('Tanggal lahir', fmtTgl(b.tglLahir))}${ket('NIK', esc(b.nik || '–'))}${ket('No KK', esc(b.kk || '–'))}
        ${ket('Ayah / Ibu', esc((b.ayah || '–') + ' / ' + (b.ibu || '–')))}${ket('RT / RW', rtRw(b).slice(6))}
        ${b.hp ? ket('HP orang tua', `<a href="tel:${esc(b.hp)}">${esc(b.hp)}</a>`) : ''}
        ${ket('Lahir', (+b.bbLahir ? ribuan(b.bbLahir) + ' g' : '–') + ' · ' + (b.pbLahir ? angka(b.pbLahir) + ' cm' : '–') + (b.prematur === 'Y' ? ' · prematur' : ''))}
        ${b.tglKeluar ? ket('Keluar', fmtTgl(b.tglKeluar)) : ''}
      </table></div>
      <div class="deret-tombol" style="margin-top:12px">
        ${aktif ? `<button class="tombol" data-aksi="formUkurP" data-id="${esc(id)}" data-p="${P}">${ikon('ukur', 20)} Ukur</button>` : ''}
        <button class="tombol garis" data-aksi="ke" data-ke="ubah-balita/${esc(id)}">Ubah data</button>
        ${aktif && !usulan.length ? `<button class="tombol garis" data-aksi="mutasi" data-id="${esc(id)}">Keluarkan</button>` : ''}
        ${!aktif && admin() ? `<button class="tombol garis" data-aksi="aktifkan" data-id="${esc(id)}">Aktifkan lagi</button>` : ''}
      </div>
    </div>
    ${t ? `<div class="kartu"><div class="baris antara"><h2 style="margin:0">Terakhir: ${namaPeriode(t.periode)}</h2><span class="lbl ${t.label}">${t.label}</span></div>
      <div class="grid2" style="margin-top:10px">
        <div class="angka"><b>${angka(t.bb)}</b><span>BB (kg) · ${esc(t.stBBU || '–')}</span></div>
        <div class="angka"><b>${angka(t.tb)}</b><span>TB (cm) · ${esc(t.stTBU || '–')}</span></div>
        <div class="angka"><b>${angka(t.lila)}</b><span>LiLA (cm) · ${esc(t.stLILA || '–')}</span></div>
        <div class="angka"><b>${angka(t.lk)}</b><span>LK (cm) · ${esc(t.stLKU || '–')}</span></div></div>
      ${t.stBBTB ? `<p class="kecil" style="margin:10px 0 0">BB/TB: <b>${esc(t.stBBTB)}</b></p>` : ''}
      ${t.alasan ? `<p class="kecil" style="margin:6px 0 0">${esc(t.alasan)}</p>` : ''}</div>` : ''}
    ${rows.length ? `<div class="kartu"><h2>Grafik pertumbuhan</h2>
      <div class="chips">${[['bbu', 'BB/U'], ['tbu', 'TB/U'], ['lku', 'LK/U']].map(g => `<button class="chip ${S.grafik === g[0] ? 'aktif' : ''}" data-aksi="grafik" data-g="${g[0]}">${g[1]}</button>`).join('')}</div>
      <div class="grafik">${grafikKMS(b, S.grafik)}</div>
      <p class="redup kecil" style="margin:6px 0 0">Garis tebal = median WHO; area hijau = −2 s.d. +2 SD; titik = hasil ukur.</p></div>` : ''}
    <div class="kartu"><h2>Riwayat pengukuran</h2>${rows.length ? `<div class="tabel-wrap"><table>
      <tr><th>Bulan</th><th class="angka-sel">BB</th><th class="angka-sel">TB</th><th class="angka-sel">LiLA</th><th class="angka-sel">LK</th><th>N/T</th><th>Label</th></tr>
      ${rows.map(r => `<tr class="bisa-ketuk" data-aksi="formUkurP" data-id="${esc(id)}" data-p="${r.periode}"><td>${namaPeriode(r.periode).slice(0, 3)} ${r.periode.slice(2, 4)}${r._lokal ? ' ⏳' : ''}</td>
        <td class="angka-sel">${angka(r.bb)}</td><td class="angka-sel">${angka(r.tb)}</td><td class="angka-sel">${angka(r.lila)}</td><td class="angka-sel">${angka(r.lk)}</td>
        <td>${esc(r.nt || '')}</td><td><span class="lbl ${r.label}">${r.label}</span></td></tr>`).join('')}</table></div>
      <p class="redup kecil" style="margin:8px 0 0">Ketuk baris untuk melihat atau memperbaiki.</p>` : '<div class="redup">Belum ada pengukuran.</div>'}</div>
    <div class="kartu" id="imun"><div class="baris antara"><h2 style="margin:0">Imunisasi</h2><span class="lbl ${si.idl ? 'Hijau' : 'Abu'}">${si.idl ? 'Dasar lengkap' : 'Dasar belum lengkap'}</span></div>
      ${si.list.filter(v => S.semuaVaksin || v.status !== 'Belum waktunya' || v === si.list.find(z => z.status === 'Belum waktunya')).map(v => `<div class="vaksin"><div class="nm">${esc(v.nama)}<small>${v.tgl ? 'Diberi ' + fmtTgl(v.tgl) : 'Usia ' + usiaJadwal(v.kode)}</small></div>
        <span class="lbl ${{ Selesai: 'Hijau', 'Jatuh tempo': 'Kuning', Terlambat: 'Merah', 'Belum waktunya': 'Abu' }[v.status]}">${v.status}</span>
        <button class="tombol garis kecil" data-aksi="formImun" data-id="${esc(id)}" data-k="${esc(v.kode)}">${v.tgl ? 'Ubah' : 'Catat'}</button></div>`).join('')}
      ${si.list.filter(v => v.status === 'Belum waktunya').length > 1 ? `<button class="tombol garis kecil penuh" style="margin-top:10px" data-aksi="semuaVaksin">${S.semuaVaksin ? 'Sembunyikan jadwal berikutnya' : 'Tampilkan semua jadwal (' + si.list.filter(v => v.status === 'Belum waktunya').length + ' belum waktunya)'}</button>` : ''}</div>
    <div class="kartu"><div class="baris antara"><h2 style="margin:0">Vitamin A &amp; obat cacing</h2><button class="tombol garis kecil" data-aksi="formVit" data-id="${esc(id)}">Catat</button></div>
      ${vit.length ? vit.map(v => `<div class="vaksin"><div class="nm">${{ VitA_Biru: 'Vitamin A biru', VitA_Merah: 'Vitamin A merah', Obat_Cacing: 'Obat cacing' }[v.jenis]}${v._lokal ? ' ⏳' : ''}<small>${fmtTgl(v.tgl)} · periode ${namaPeriode(v.periode)}</small></div>
        <button class="tombol bahaya kecil" data-aksi="hapusVit" data-id="${esc(id)}" data-v="${esc(v.id)}">Hapus</button></div>`).join('') : '<div class="redup" style="margin-top:8px">Belum ada catatan.</div>'}
      ${si.usia >= 6 && si.usia <= 59 && !vitASudah(b, periodeVitA(P)) ? `<div class="pesan-awas" style="margin:10px 0 0">Belum menerima vitamin A periode ${namaPeriode(periodeVitA(P))}.</div>` : ''}</div>
    ${kartuKPSP(b)}${kartuPD3I(b)}
    <div class="kartu"><div class="baris antara"><h2 style="margin:0">Tindak lanjut</h2><button class="tombol garis kecil" data-aksi="formTL" data-id="${esc(id)}">Catat</button></div>
      ${tl.length ? tl.slice().reverse().map(x => `<div class="vaksin"><div class="nm"><b>${esc(x.Status)}</b> · ${esc(x.Label)} · ${namaPeriode(String(x.Periode))}
        <small>${esc(x.Alasan)}</small>${x.Dirujuk_Ke ? `<small>Dirujuk ke ${esc(x.Dirujuk_Ke)} ${x.Tgl_Rujuk ? fmtTgl(x.Tgl_Rujuk) : ''}</small>` : ''}
        ${x.Intervensi ? `<small>Intervensi: ${esc(x.Intervensi)}</small>` : ''}${x.Hasil_Periksa ? `<small>Hasil: ${esc(x.Hasil_Periksa)}</small>` : ''}</div></div>`).join('') : '<div class="redup" style="margin-top:8px">Tidak ada.</div>'}</div>` };
}
function usiaJadwal(kode) { const j = S.d.jadwal.find(x => x.kode === kode); return j ? (j.min === 0 && j.maks === 0 ? '0–24 jam' : j.min + (j.maks > j.min ? '–' + j.maks : '') + ' bln') : ''; }

/* Grafik KMS: kurva WHO −3, −2, 0, +2, +3 SD dan titik anak */
function grafikKMS(b, ind) {
  const T = WHO[b.jk === 'P' ? 'P' : 'L'];
  const lms = m => ind === 'bbu' ? T.bbu[m] : ind === 'lku' ? T.lku[m] : (m < 24 ? T.pbu[m] : T.tbu[m - 24]);
  const titik = Object.values(S.d.ukur[b.id] || {}).map(r => ({ x: usiaHari(b.tglLahir, r.tglUkur) / 30.4375,
    y: +(ind === 'bbu' ? r.bb : ind === 'lku' ? r.lk : (r.tbKoreksi || r.tb)) })).filter(p => p.y > 0).sort((a, c) => a.x - c.x);
  if (!titik.length) return '<div class="redup kecil">Belum ada data untuk indikator ini.</div>';
  const kini = usiaHari(b.tglLahir, hariIni()) / 30.4375;
  let x0 = Math.max(0, Math.floor(Math.min(titik[0].x, kini) - 3)), x1 = Math.min(60, Math.ceil(Math.max(titik[titik.length - 1].x, kini) + 3));
  if (x1 - x0 < 12) { x1 = Math.min(60, x0 + 12); x0 = Math.max(0, x1 - 12); }
  const zs = [-3, -2, 0, 2, 3], kurva = zs.map(() => []);
  for (let m = x0; m <= x1; m++) { const l = lms(m); zs.forEach((z, i) => kurva[i].push({ x: m, y: _nilaiSD(l[0], l[1], l[2], z) })); }
  let y0 = Math.min(kurva[0][0].y, ...titik.map(p => p.y)), y1 = Math.max(kurva[4][kurva[4].length - 1].y, ...titik.map(p => p.y));
  const pad = (y1 - y0) * 0.06; y0 = Math.floor(y0 - pad); y1 = Math.ceil(y1 + pad);
  const W = 640, H = 380, L = 56, R = 14, A = 24, B = 46;
  const X = v => L + (v - x0) / (x1 - x0) * (W - L - R), Y = v => A + (1 - (v - y0) / (y1 - y0)) * (H - A - B);
  const garis = pts => pts.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join('');
  const area = (atas, bawah) => garis(atas) + bawah.slice().reverse().map(p => 'L' + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join('') + 'Z';
  const langkahX = (x1 - x0) > 30 ? 6 : 3, langkahY = (y1 - y0) > 40 ? 10 : (y1 - y0) > 16 ? 5 : (y1 - y0) > 8 ? 2 : 1;
  let sumbu = '';
  for (let m = Math.ceil(x0 / langkahX) * langkahX; m <= x1; m += langkahX) sumbu += `<line x1="${X(m)}" x2="${X(m)}" y1="${A}" y2="${H - B}" stroke="#e6ece9"/><text x="${X(m)}" y="${H - B + 26}" text-anchor="middle" font-size="21" fill="#56625e">${m}</text>`;
  for (let v = Math.ceil(y0 / langkahY) * langkahY; v <= y1; v += langkahY) sumbu += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e6ece9"/><text x="${L - 8}" y="${Y(v) + 7}" text-anchor="end" font-size="21" fill="#56625e">${v}</text>`;
  const sat = ind === 'bbu' ? 'kg' : 'cm';
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik pertumbuhan">
    ${sumbu}
    <path d="${area(kurva[1], kurva[0])}" fill="#fde8e6"/>
    <path d="${area(kurva[3], kurva[1])}" fill="#e3f4e7"/>
    ${kurva.map((k, i) => `<path d="${garis(k)}" fill="none" stroke="${i === 2 ? '#1e7a3c' : i === 1 || i === 3 ? '#e0a100' : '#b42318'}" stroke-width="${i === 2 ? 2.8 : 1.8}" ${i === 0 || i === 4 ? 'stroke-dasharray="4 3"' : ''}/>`).join('')}
    <path d="${garis(titik)}" fill="none" stroke="#1468e5" stroke-width="3"/>
    ${titik.map(p => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="6.5" fill="#1468e5" stroke="#fff" stroke-width="2"/>`).join('')}
    <text x="${W - R}" y="${H - 2}" text-anchor="end" font-size="19" fill="#56625e">usia (bulan)</text>
    <text x="4" y="18" font-size="19" fill="#56625e">${sat}</text>
  </svg>`;
}

/* ---------- Form imunisasi, vitamin, tindak lanjut, mutasi ---------- */
function formImun(id, kode) {
  const b = S.d.byId[id], j = S.d.jadwal.find(x => x.kode === kode), ada = (S.d.imun[id] || {})[kode];
  bukaLembar(`<h3>${esc(j ? j.nama : kode)}</h3><div class="redup kecil" style="margin-bottom:12px">${esc(b.nama)} · jadwal usia ${usiaJadwal(kode)}</div>
    <form id="fImun" data-id="${esc(id)}" data-k="${esc(kode)}">
      <label class="isian"><span>Tanggal pemberian</span><input type="date" name="tgl" value="${ada ? ada.tgl : hariIni()}" min="${b.tglLahir}" max="${hariIni()}" required></label>
      <label class="isian"><span>Tempat</span><select name="tempat">${['Posyandu', 'Puskesmas', 'Bidan desa', 'Klinik/RS', 'Lainnya'].map(t => `<option ${ada && ada.tempat === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <button class="tombol penuh" type="submit">Simpan</button>
      <div class="deret-tombol" style="margin-top:10px">${ada ? '<button type="button" class="tombol bahaya" data-aksi="hapusImun">Hapus</button>' : ''}<button type="button" class="tombol garis" data-aksi="tutup">Batal</button></div>
    </form>`);
}

function formVit(id) {
  const b = S.d.byId[id], usia = usiaBulan(b.tglLahir, hariIni()), def = jenisVitA(usia) || 'Obat_Cacing';
  bukaLembar(`<h3>Vitamin A / obat cacing</h3><div class="redup kecil" style="margin-bottom:12px">${esc(b.nama)} · ${usiaTeks(usia)}</div>
    <form id="fVit" data-id="${esc(id)}">
      <label class="isian"><span>Jenis</span><select name="jenis">
        <option value="VitA_Biru" ${def === 'VitA_Biru' ? 'selected' : ''}>Vitamin A biru (6–11 bulan)</option>
        <option value="VitA_Merah" ${def === 'VitA_Merah' ? 'selected' : ''}>Vitamin A merah (12–59 bulan)</option>
        <option value="Obat_Cacing" ${def === 'Obat_Cacing' ? 'selected' : ''}>Obat cacing</option></select></label>
      <label class="isian"><span>Tanggal pemberian</span><input type="date" name="tgl" value="${hariIni()}" min="${b.tglLahir}" max="${hariIni()}" required></label>
      <button class="tombol penuh" type="submit">Simpan</button>
      <button type="button" class="tombol garis penuh" style="margin-top:10px" data-aksi="tutup">Batal</button>
    </form>`);
}

function formTL(id) {
  const b = S.d.byId[id], t = tlTerbuka(id), u = ukurTerakhir(id);
  const rujuk = ['Bidan desa', 'Puskesmas Purwanegara', 'Dokter/RS', 'Ahli gizi Puskesmas', 'Lainnya'];
  const iv = ['PMT', 'Konseling gizi', 'Kunjungan rumah', 'Pemeriksaan dokter', 'Rujuk RS'];
  const sudahIv = t && t.Intervensi ? String(t.Intervensi).split(', ') : [];
  bukaLembar(`<h3>Tindak lanjut</h3><div class="redup kecil" style="margin-bottom:12px">${esc(b.nama)} · Ibu ${esc(b.ibu || '–')} · ${rtRw(b)}</div>
    ${t ? `<div class="hasil ${t.Label}"><b>${esc(t.Label)}</b> sejak ${fmtTgl(t.Tgl_Terdeteksi)}<div class="kecil">${esc(t.Alasan)}</div></div>`
       : u && u.label !== 'Hijau' ? `<div class="hasil ${u.label}"><b>${u.label}</b><div class="kecil">${esc(u.alasan)}</div></div>` : ''}
    <form id="fTL" data-id="${esc(id)}" data-tl="${t && String(t.ID).indexOf('L-') !== 0 ? esc(t.ID) : ''}" data-label="${esc(u ? u.label : 'Kuning')}" data-alasan="${esc(u ? u.alasan : '')}">
      <label class="isian"><span>Status</span><select name="status">${['Belum', 'Sedang', 'Membaik', 'Selesai'].map(s => `<option ${t && t.Status === s ? 'selected' : (!t && s === 'Sedang' ? 'selected' : '')}>${s}</option>`).join('')}</select></label>
      <div class="grid2">
        <label class="isian"><span>Tanggal rujuk</span><input type="date" name="tglRujuk" value="${t && t.Tgl_Rujuk ? t.Tgl_Rujuk : hariIni()}" max="${hariIni()}"></label>
        <label class="isian"><span>Dirujuk ke</span><select name="dirujukKe"><option value="">–</option>${rujuk.map(r => `<option ${t && t.Dirujuk_Ke === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      </div>
      <div class="isian"><span class="redup kecil" style="display:block;margin-bottom:6px;font-weight:550">Intervensi</span><div class="chips" style="flex-wrap:wrap">
        ${iv.map(x => `<label class="chip ${sudahIv.indexOf(x) >= 0 ? 'aktif' : ''}"><input type="checkbox" name="iv" value="${x}" ${sudahIv.indexOf(x) >= 0 ? 'checked' : ''} style="display:none" onchange="this.parentNode.classList.toggle('aktif',this.checked)">${x}</label>`).join('')}</div></div>
      <label class="isian"><span>Hasil pemeriksaan / catatan</span><textarea name="hasil">${esc(t ? t.Hasil_Periksa : '')}</textarea></label>
      <button class="tombol penuh" type="submit">Simpan</button>
      <div class="deret-tombol" style="margin-top:10px"><button type="button" class="tombol garis" data-aksi="tutup">Batal</button>
        <button type="button" class="tombol garis" data-aksi="ke" data-ke="balita/${esc(id)}">Profil</button></div>
    </form>`);
}

function formMutasi(id) {
  const b = S.d.byId[id];
  bukaLembar(`<h3>Keluarkan dari daftar</h3><div class="redup kecil" style="margin-bottom:12px">${esc(b.nama)}. ${admin() ? 'Langsung berlaku.' : 'Usulan akan disetujui admin.'} Data tidak dihapus.</div>
    <form id="fMutasi" data-id="${esc(id)}">
      <label class="isian"><span>Alasan</span><select name="alasan" required><option value="">Pilih…</option><option>Pindah</option><option>Meninggal</option><option>Lainnya</option></select></label>
      <label class="isian"><span>Tanggal</span><input type="date" name="tanggal" value="${hariIni()}" max="${hariIni()}" required></label>
      <label class="isian"><span>Keterangan</span><input name="keterangan" placeholder="Contoh: pindah ke Kec. Bawang"></label>
      <button class="tombol bahaya penuh" type="submit">${admin() ? 'Keluarkan' : 'Kirim usulan'}</button>
      <button type="button" class="tombol garis penuh" style="margin-top:10px" data-aksi="tutup">Batal</button>
    </form>`);
}

/* ---------- Perkembangan (KPSP) ---------- */
const WARNA_KPSP = { Sesuai: 'Hijau', Meragukan: 'Kuning', Penyimpangan: 'Merah' };
/* Usia formulir KPSP yang sudah tercapai tetapi belum dicatat (0 = tidak ada) */
function kpspTempo(b) {
  const uk = usiaKPSP(usiaBulan(b.tglLahir, hariIni()));
  return uk && !(S.d.kpsp[b.id] || {})[uk] ? uk : 0;
}
function kpspTerakhir(id) {
  const l = Object.values(S.d.kpsp[id] || {});
  return l.length ? l.reduce((a, c) => (c.usia > a.usia ? c : a)) : null;
}
function kpspPerlu() {
  return sasaran(periodeKini()).map(b => ({ b, k: kpspTerakhir(b.id) })).filter(x => x.k && x.k.hasil !== 'Sesuai')
    .sort((a, c) => (a.k.hasil === 'Penyimpangan' ? 0 : 1) - (c.k.hasil === 'Penyimpangan' ? 0 : 1) || urutNama(a.b, c.b));
}
function kartuKPSP(b) {
  const usia = usiaBulan(b.tglLahir, hariIni()), tempo = kpspTempo(b);
  const list = Object.values(S.d.kpsp[b.id] || {}).sort((a, c) => c.usia - a.usia);
  return `<div class="kartu"><div class="baris antara"><h2 style="margin:0">Perkembangan (KPSP)</h2>
      ${usia >= 3 ? `<button class="tombol garis kecil" data-aksi="formKPSP" data-id="${esc(b.id)}">Catat</button>` : ''}</div>
    ${usia < 3 ? '<div class="redup" style="margin-top:8px">KPSP dimulai pada usia 3 bulan.</div>' : ''}
    ${tempo ? `<div class="pesan-awas" style="margin:10px 0 0">KPSP ${tempo} bulan belum dicatat.</div>` : ''}
    ${list.map(k => `<div class="vaksin"><div class="nm">KPSP ${k.usia} bulan${k._lokal ? ' ⏳' : ''}
      <small>${fmtTgl(k.tgl)} · jawaban "Ya" ${k.ya}/10${k.tdd ? ' · daya dengar: ' + esc(k.tdd).toLowerCase() : ''}${k.tdl ? ' · daya lihat: ' + esc(k.tdl).toLowerCase() : ''}</small>
      <small>${esc(SARAN_KPSP[k.hasil] || '')}</small>${k.catatan ? `<small>Catatan: ${esc(k.catatan)}</small>` : ''}</div>
      <span class="lbl ${WARNA_KPSP[k.hasil] || 'Abu'}">${esc(k.hasil)}</span></div>`).join('')}
    ${usia >= 3 && !list.length ? '<div class="redup" style="margin-top:8px">Belum ada catatan.</div>' : ''}</div>`;
}
function formKPSP(id) {
  const b = S.d.byId[id], usia = usiaBulan(b.tglLahir, hariIni()), uk = usiaKPSP(usia);
  if (!uk) { toast('KPSP dimulai pada usia 3 bulan.'); return; }
  const ada = (S.d.kpsp[id] || {})[uk];
  const pilih = (nama, nilai) => `<select name="${nama}">${[['', 'Tidak diperiksa'], ['Normal', 'Normal'], ['Curiga gangguan', 'Curiga gangguan']]
    .map(o => `<option value="${o[0]}" ${nilai === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>`;
  bukaLembar(`<h3>Perkembangan (KPSP)</h3><div class="redup kecil" style="margin-bottom:12px">${esc(b.nama)} · ${usiaTeks(usia)}</div>
    <div class="pesan-info">Pakai <b>formulir KPSP ${uk} bulan</b> dari buku KIA atau pedoman SDIDTK. Tanyakan ke ibu atau minta anak melakukan tiap butir, lalu hitung jawaban "Ya".</div>
    <form id="fKPSP" data-id="${esc(id)}">
      <div class="grid2">
        <label class="isian"><span>Formulir KPSP usia</span><select name="usiaKpsp">${USIA_KPSP.filter(u => u <= usia).reverse()
          .map(u => `<option value="${u}" ${u === uk ? 'selected' : ''}>${u} bulan</option>`).join('')}</select></label>
        <label class="isian"><span>Tanggal pemeriksaan</span><input type="date" name="tgl" value="${ada ? ada.tgl : hariIni()}" min="${b.tglLahir}" max="${hariIni()}" required></label>
      </div>
      <label class="isian"><span>Jumlah jawaban "Ya" (dari 10 pertanyaan)</span><select name="jumlahYa"><option value="">Pilih…</option>
        ${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map(n => `<option value="${n}" ${ada && ada.ya === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <div id="hasilKPSP"></div>
      <div class="grid2">
        <label class="isian"><span>Tes daya dengar (TDD)</span>${pilih('tdd', ada ? ada.tdd : '')}</label>
        <label class="isian"><span>Tes daya lihat (TDL)</span>${pilih('tdl', ada ? ada.tdl : '')}</label>
      </div>
      <label class="isian"><span>Catatan (butir yang dijawab "Tidak", stimulasi yang diajarkan)</span><input name="catatan" maxlength="200" value="${ada ? esc(ada.catatan) : ''}"></label>
      <div id="galatKPSP"></div>
      <button class="tombol penuh" type="submit">Simpan</button>
      <button type="button" class="tombol garis penuh" style="margin-top:10px" data-aksi="tutup">Batal</button>
    </form>`, el => {
    const s = el.querySelector('[name=jumlahYa]'), out = el.querySelector('#hasilKPSP');
    const tampil = () => { if (s.value === '') { out.innerHTML = ''; return; } const h = hasilKPSP(+s.value);
      out.innerHTML = `<div class="hasil ${WARNA_KPSP[h]}"><b>${h}</b><div class="kecil">${esc(SARAN_KPSP[h])}</div></div>`; };
    s.addEventListener('change', tampil); tampil();
  });
}

/* ---------- PD3I (suspek penyakit yang dapat dicegah imunisasi) ---------- */
const STATUS_AKTIF_PD3I = ['Dilaporkan', 'Diperiksa nakes', 'Kasus'];
const WARNA_PD3I = { Dilaporkan: 'Merah', 'Diperiksa nakes': 'Biru', Kasus: 'Merah', 'Bukan kasus': 'Abu', Selesai: 'Hijau' };
const namaPD3I = k => (PENYAKIT_PD3I.find(p => p.kode === k) || { nama: k }).nama;
function pd3iAktif() {
  return (S.d.pd3i || []).filter(x => STATUS_AKTIF_PD3I.indexOf(x.status) >= 0 && S.d.byId[x.id] && posTerpilih(S.d.byId[x.id]))
    .sort((a, c) => (a.tglGejala < c.tglGejala ? 1 : -1));
}
function imunTerkaitTeks(id, kode) {
  const p = PENYAKIT_PD3I.find(x => x.kode === kode);
  if (!p || !p.vaksin.length) return '';
  const im = S.d.imun[id] || {};
  return p.vaksin.map(k => k + ' ' + (im[k] ? fmtTgl(im[k].tgl) : 'belum')).join('; ');
}
const itemPD3I = x => { const b = S.d.byId[x.id]; return `<button class="item" data-aksi="formPD3I" data-id="${esc(x.id)}" data-lapor="${esc(x.idLapor)}">
  <span class="avatar ${b.jk}">${esc(inisial(b.nama))}</span><span class="isi"><div class="nama">${esc(b.nama)}${x._lokal ? ' ⏳' : ''}</div>
  <div class="sub">Suspek ${esc(namaPD3I(x.penyakit))} · gejala sejak ${fmtTgl(x.tglGejala)}</div>
  <div class="sub">Ibu ${esc(b.ibu || '–')} · ${rtRw(b)}${admin() && !S.pos ? ' · ' + esc(b.posyandu) : ''}</div></span>
  <span class="lbl ${WARNA_PD3I[x.status] || 'Abu'}">${esc(x.status)}</span></button>`; };
function kartuPD3I(b) {
  const list = (S.d.pd3i || []).filter(x => x.id === b.id).sort((a, c) => (a.tglGejala < c.tglGejala ? 1 : -1));
  return `<div class="kartu"><div class="baris antara"><h2 style="margin:0">Suspek PD3I</h2>
      <button class="tombol garis kecil" data-aksi="formPD3I" data-id="${esc(b.id)}">Laporkan</button></div>
    ${list.length ? list.map(x => `<div class="vaksin bisa-ketuk" data-aksi="formPD3I" data-id="${esc(b.id)}" data-lapor="${esc(x.idLapor)}"><div class="nm">${esc(namaPD3I(x.penyakit))}${x._lokal ? ' ⏳' : ''}
      <small>Gejala sejak ${fmtTgl(x.tglGejala)}${x.gejala ? ' · ' + esc(x.gejala) : ''}</small>${x.tl ? `<small>Tindak lanjut: ${esc(x.tl)}</small>` : ''}</div>
      <span class="lbl ${WARNA_PD3I[x.status] || 'Abu'}">${esc(x.status)}</span></div>`).join('')
      : '<div class="redup" style="margin-top:8px">Tidak ada laporan. Laporkan bila anak menunjukkan gejala campak, difteri, batuk rejan, lumpuh layu, atau tetanus pada bayi.</div>'}</div>`;
}
function formPD3I(id, idLapor) {
  const b = S.d.byId[id], ada = idLapor ? (S.d.pd3i || []).find(x => x.idLapor === idLapor) : null;
  bukaLembar(`<h3>${ada ? 'Laporan suspek PD3I' : 'Laporkan suspek PD3I'}</h3>
    <div class="redup kecil" style="margin-bottom:12px">${esc(b.nama)} · ${usiaTeks(usiaBulan(b.tglLahir, hariIni()))} · Ibu ${esc(b.ibu || '–')} · ${rtRw(b)}</div>
    ${ada ? '' : '<div class="pesan-awas">Laporkan paling lambat 24 jam sejak gejala diketahui, dan minta orang tua segera membawa anak ke bidan desa atau Puskesmas.</div>'}
    <form id="fPD3I" data-id="${esc(id)}" data-lapor="${ada ? esc(ada.idLapor) : ''}">
      <label class="isian"><span>Dicurigai</span><select name="penyakit"><option value="">Pilih…</option>${PENYAKIT_PD3I.map(p =>
        `<option value="${p.kode}" ${ada && ada.penyakit === p.kode ? 'selected' : ''}>${esc(p.nama)}</option>`).join('')}</select></label>
      <div id="ciriPD3I"></div>
      <label class="isian"><span>Tanggal mulai gejala</span><input type="date" name="tglGejala" value="${ada ? ada.tglGejala : hariIni()}" min="${b.tglLahir}" max="${hariIni()}" required></label>
      <label class="isian"><span>Gejala yang terlihat / keterangan</span><textarea name="gejala" maxlength="300">${ada ? esc(ada.gejala) : ''}</textarea></label>
      ${ada ? `<div class="grid2"><label class="isian"><span>Status</span><select name="status">${STATUS_PD3I.map(s => `<option ${ada.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <div class="isian"><span class="redup kecil">Dilaporkan ${fmtTgl(ada.tglLapor)} oleh ${esc(ada.pelapor || '–')}</span></div></div>
        <label class="isian"><span>Tindak lanjut (hasil pemeriksaan nakes, rujukan, sampel)</span><textarea name="tindakLanjut" maxlength="300">${esc(ada.tl || '')}</textarea></label>` : ''}
      <div id="galatPD3I"></div>
      <button class="tombol ${ada ? '' : 'bahaya '}penuh" type="submit">${ada ? 'Simpan' : 'Kirim laporan'}</button>
      <button type="button" class="tombol garis penuh" style="margin-top:10px" data-aksi="tutup">Batal</button>
      <p class="redup kecil">Laporan ini suspek (dugaan). Kepastian diagnosis oleh petugas kesehatan.</p>
    </form>`, el => {
    const s = el.querySelector('[name=penyakit]'), out = el.querySelector('#ciriPD3I');
    const tampil = () => { const p = PENYAKIT_PD3I.find(x => x.kode === s.value); const im = p ? imunTerkaitTeks(id, p.kode) : '';
      out.innerHTML = p ? `<div class="pesan-info"><b>Ciri:</b> ${esc(p.ciri)}${im ? `<br><b>Imunisasi terkait:</b> ${esc(im)}` : ''}</div>` : ''; };
    s.addEventListener('change', tampil); tampil();
  });
}

/* =====================================================================
   LANSIA — daftar, pemeriksaan bulanan, profil, tambah/ubah, keluar
   ===================================================================== */
const usiaTh = tgl => Math.floor(usiaBulan(tgl, hariIni()) / 12);
const periksaDi = (id, p) => (S.d.periksaL[id] || {})[p] || null;
function periksaTerakhir(id) {
  const u = S.d.periksaL[id] || {}, ps = Object.keys(u).sort();
  return ps.length ? u[ps[ps.length - 1]] : null;
}
function sasaranLansia(pos) {
  return S.d.lansia.filter(l => (l.status === 'Aktif' || l.status === 'Menunggu') && (pos === undefined ? posTerpilih(l) : l.posyandu === pos));
}
const tdTeks = x => x && +x.sistol ? x.sistol + '/' + x.diastol : '–';

function viewLansia() {
  if (!S.periodeL) S.periodeL = periodeKini();
  const ps = opsiPeriode();
  if (ps.indexOf(S.periodeL) < 0) S.periodeL = ps[0];
  const boleh = bisaUbahPeriode(S.periodeL);
  return { judul: 'Lansia ' + namaPeriode(S.periodeL), nav: 'menu', html: `
    ${admin() ? `<div class="grid2"><label class="isian"><span>Periode</span><select data-ubah="periodeL">${ps.map(p => `<option value="${p}" ${p === S.periodeL ? 'selected' : ''}>${namaPeriode(p)}</option>`).join('')}</select></label>${pilihPosyandu()}</div>`
      : `<div class="chips">${ps.map(p => `<button class="chip ${p === S.periodeL ? 'aktif' : ''}" data-aksi="periodeL" data-p="${p}">${namaPeriode(p)}</button>`).join('')}</div>`}
    ${boleh.ok ? '' : `<div class="pesan-awas">${esc(boleh.pesan)} Data hanya bisa dilihat.</div>`}
    <div class="cari">${ikon('cari', 20)}<input id="cariL" type="search" placeholder="Cari nama atau RT" value="${esc(S.cariL || '')}" autocomplete="off"></div>
    <div class="chips">${[['belum', 'Belum diperiksa'], ['sudah', 'Sudah diperiksa'], ['semua', 'Semua']].map(f => `<button class="chip ${(S.filterL || 'belum') === f[0] ? 'aktif' : ''}" data-aksi="filterL" data-f="${f[0]}">${f[1]}</button>`).join('')}</div>
    <button class="tombol garis penuh" data-aksi="ke" data-ke="tambah-lansia" style="margin-bottom:10px">${ikon('tambah', 20)} Tambah lansia</button>
    <div id="daftarL"></div>`,
    setelah: () => { isiDaftarLansia(); const c = $('#cariL'); c.addEventListener('input', () => { S.cariL = c.value; isiDaftarLansia(); }); } };
}
function isiDaftarLansia() {
  const el = $('#daftarL'); if (!el) return;
  const p = S.periodeL, f = S.filterL || 'belum', q = rapiSpasi(S.cariL || '').toLowerCase();
  let list = sasaranLansia().sort(urutNama);
  const total = list.length, sudah = list.filter(l => periksaDi(l.id, p)).length;
  if (f === 'belum') list = list.filter(l => !periksaDi(l.id, p));
  if (f === 'sudah') list = list.filter(l => periksaDi(l.id, p));
  if (q) list = list.filter(l => l.nama.toLowerCase().indexOf(q) >= 0 || ('rt ' + l.rt).indexOf(q) >= 0 || rtRw(l).toLowerCase().indexOf(q) >= 0);
  el.innerHTML = `<p class="redup kecil" style="margin:0 4px 8px">${sudah} dari ${total} sudah diperiksa · ${list.length} ditampilkan</p>` + (list.length ? `<div class="daftar">${list.slice(0, 300).map(l => {
    const u = periksaDi(l.id, p);
    return `<button class="item" data-aksi="formPeriksaL" data-id="${esc(l.id)}">
      <span class="avatar ${l.jk}">${esc(inisial(l.nama))}</span>
      <span class="isi"><div class="nama">${esc(l.nama)}${l._lokal ? ' ⏳' : ''}</div><div class="sub">${usiaTh(l.tglLahir)} th · ${rtRw(l)}${admin() && !S.pos ? ' · ' + esc(l.posyandu) : ''}${u ? ' · TD ' + tdTeks(u) : ''}</div></span>
      ${u ? `<span class="lbl ${u.label}">${u.label}</span><span class="centang ${u._lokal ? 'lokal' : 'sudah'}">${ikon(u._lokal ? 'jam' : 'centang', 18)}</span>` : '<span class="centang belum"></span>'}
    </button>`; }).join('')}</div>` : `<div class="kosong">${f === 'belum' && !q ? 'Semua lansia sudah diperiksa. Terima kasih!' : 'Tidak ada lansia yang cocok.'}</div>`);
}

function formPeriksaL(id, periode) {
  const l = S.d.lansiaById[id]; if (!l) return;
  periode = periode || S.periodeL || periodeKini();
  const u = periksaDi(id, periode), boleh = bisaUbahPeriode(periode), dis = boleh.ok ? '' : 'disabled';
  const lalu = (() => { const t = periksaTerakhir(id); return t && t.periode < periode ? t : null; })();
  const tglDef = u ? u.tgl : (periode === periodeKini() ? hariIni() : akhirPeriode(periode));
  const maxTgl = akhirPeriode(periode) > hariIni() ? hariIni() : akhirPeriode(periode);
  const nilai = k => u ? esc(angka(u[k]).replace('–', '')) : '';
  const hint = (k, sat) => lalu && lalu[k] !== '' && lalu[k] !== undefined ? `<div class="lalu">${namaPeriode(lalu.periode).split(' ')[0]}: ${angka(lalu[k])} ${sat}</div>` : '';
  const yt = (nama, v) => `<select name="${nama}" ${dis}><option value="">–</option><option value="Y" ${v === 'Y' ? 'selected' : ''}>Ya</option><option value="T" ${v === 'T' ? 'selected' : ''}>Tidak</option></select>`;
  const riw = [l.rHT === 'Y' ? 'hipertensi' : '', l.rDM === 'Y' ? 'diabetes' : ''].filter(Boolean).join(' & ');
  bukaLembar(`
    <h3>${esc(l.nama)}</h3>
    <div class="redup kecil" style="margin-bottom:12px">${l.jk === 'L' ? 'Laki-laki' : 'Perempuan'} · ${usiaTh(l.tglLahir)} th · ${rtRw(l)} · ${namaPeriode(periode)}${riw ? ' · riwayat ' + riw : ''}</div>
    ${boleh.ok ? '' : `<div class="pesan-awas">${esc(boleh.pesan)}</div>`}
    ${u ? `<div class="pesan-info">Data ${namaPeriode(periode)} sudah ada${u._lokal ? ' (belum terkirim)' : ''}. Ubah angka lalu tekan Perbarui.</div>` : ''}
    <form id="fPeriksaL" data-id="${esc(id)}" data-periode="${periode}">
      <label class="isian"><span>Tanggal periksa</span><input type="date" name="tgl" value="${tglDef}" min="${awalPeriode(periode)}" max="${maxTgl}" required ${dis}></label>
      <div class="grid2">
        <label class="isian"><span>Berat badan</span><div class="isian-angka"><input name="bb" inputmode="decimal" value="${nilai('bb')}" placeholder="0,0" ${dis}><em>kg</em></div>${hint('bb', 'kg')}</label>
        <label class="isian"><span>Tinggi badan</span><div class="isian-angka"><input name="tb" inputmode="decimal" value="${u ? nilai('tb') : (lalu && lalu.tb ? esc(angka(lalu.tb)) : '')}" placeholder="0,0" ${dis}><em>cm</em></div>${hint('tb', 'cm')}</label>
      </div>
      <label class="isian"><span>Lingkar perut</span><div class="isian-angka"><input name="lp" inputmode="decimal" value="${nilai('lp')}" placeholder="0,0" ${dis}><em>cm</em></div>${hint('lp', 'cm')}</label>
      <div class="grid2">
        <label class="isian"><span>Sistol (angka atas)</span><div class="isian-angka"><input name="sistol" inputmode="numeric" value="${nilai('sistol')}" placeholder="120" ${dis}><em>mmHg</em></div>${lalu && +lalu.sistol ? `<div class="lalu">${namaPeriode(lalu.periode).split(' ')[0]}: ${tdTeks(lalu)}</div>` : ''}</label>
        <label class="isian"><span>Diastol (angka bawah)</span><div class="isian-angka"><input name="diastol" inputmode="numeric" value="${nilai('diastol')}" placeholder="80" ${dis}><em>mmHg</em></div></label>
      </div>
      <div class="grid2">
        <label class="isian"><span>Minum obat rutin</span>${yt('obat', u ? u.obat : (lalu ? lalu.obat : ''))}</label>
        <label class="isian"><span>Merokok</span>${yt('merokok', u ? u.merokok : (lalu ? lalu.merokok : ''))}</label>
      </div>
      <div id="galatPL"></div>
      ${boleh.ok ? `<button class="tombol penuh" type="submit">${u ? 'Perbarui' : 'Simpan'}</button>
      <div class="deret-tombol" style="margin-top:10px">
        ${u ? '<button type="button" class="tombol bahaya" data-aksi="hapusPeriksaL">Hapus</button>' : ''}
        <button type="button" class="tombol garis" data-aksi="tutup">Batal</button>
        <button type="button" class="tombol garis" data-aksi="ke" data-ke="lansia-profil/${esc(id)}">Profil</button></div>`
      : `<div class="deret-tombol"><button type="button" class="tombol garis" data-aksi="tutup">Tutup</button><button type="button" class="tombol garis" data-aksi="ke" data-ke="lansia-profil/${esc(id)}">Profil</button></div>`}
    </form>`, el => { const i = el.querySelector('input[name=bb]'); if (i && !i.value && boleh.ok) setTimeout(() => i.focus(), 250); });
}

async function simpanPeriksaL(f) {
  const id = f.dataset.id, periode = f.dataset.periode, l = S.d.lansiaById[id];
  const x = { id, periode, tgl: f.tgl.value, obat: f.obat.value, merokok: f.merokok.value };
  const nama = { bb: 'Berat badan', tb: 'Tinggi badan', lp: 'Lingkar perut', sistol: 'Sistol', diastol: 'Diastol' };
  for (const k of Object.keys(nama)) {
    const n = bacaAngka(f[k].value);
    if (Number.isNaN(n)) { $('#galatPL').innerHTML = `<div class="pesan-galat">${nama[k]} harus berupa angka.</div>`; return; }
    x[k] = n === '' ? 0 : n;
  }
  const err = validasiLansia(x) || (x.tgl < l.tglLahir ? 'Tanggal periksa sebelum tanggal lahir.' : '');
  if (err) { $('#galatPL').innerHTML = `<div class="pesan-galat">${esc(err)}</div>`; return; }
  const lalu = periksaTerakhir(id), w = [];
  if (lalu && lalu.periode < periode && +lalu.bb && x.bb && Math.abs(x.bb - lalu.bb) > 5) w.push('Berat badan berubah lebih dari 5 kg dari pemeriksaan terakhir (' + angka(lalu.bb) + ' kg).');
  if (lalu && lalu.periode < periode && +lalu.tb && x.tb && Math.abs(x.tb - lalu.tb) > 3) w.push('Tinggi badan berbeda lebih dari 3 cm dari pemeriksaan terakhir (' + angka(lalu.tb) + ' cm).');
  if (w.length && !await konfirmasi('Periksa kembali angkanya', w.map(esc).join('<br>') + '<br><br>Apakah angka sudah benar?', 'Ya, tetap simpan')) return;
  await antrekan('simpanPeriksaLansia', x, 'Periksa lansia ' + l.nama + ' (' + namaPeriode(periode) + ')');
  tampilHasilL(l, periksaDi(id, periode));
}

function tampilHasilL(l, u) {
  const p = u.periode;
  const berikut = sasaranLansia().filter(z => !periksaDi(z.id, p) && z.id !== l.id).sort(urutNama).find(z => urutNama(z, l) > 0) || sasaranLansia().find(z => !periksaDi(z.id, p));
  const baris = (n, v, st) => v !== '' && v !== '–' ? `<tr><td>${n}</td><td class="angka-sel">${v}</td><td>${esc(st || '')}</td></tr>` : '';
  bukaLembar(`
    <h3>${esc(l.nama)}</h3><div class="redup kecil" style="margin-bottom:12px">Tersimpan ${S.online ? '' : '(akan dikirim saat ada sinyal)'} · ${namaPeriode(p)}</div>
    <div class="hasil ${u.label}"><div class="baris antara"><b>${u.label === 'Merah' ? 'Perlu rujukan' : u.label === 'Kuning' ? 'Waspada' : 'Normal'}</b><span class="lbl ${u.label}">${u.label}</span></div>
      ${u.alasan ? `<ul>${u.alasan.split('; ').map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '<div class="kecil">Hasil pemeriksaan dalam batas normal.</div>'}</div>
    <table><tr><th>Pemeriksaan</th><th class="angka-sel">Hasil</th><th>Status</th></tr>
      ${baris('Tekanan darah', +u.sistol ? tdTeks(u) + ' mmHg' : '', u.stTD)}${baris('IMT', u.imt !== '' && u.imt !== null ? angka(u.imt) : '', u.stIMT)}
      ${baris('Lingkar perut', +u.lp ? angka(u.lp) + ' cm' : '', u.stLP)}${baris('Berat badan', +u.bb ? angka(u.bb) + ' kg' : '', '')}</table>
    <p class="redup kecil">Hasil ini penanda dini, bukan diagnosis. Pemeriksaan dan pengobatan oleh tenaga kesehatan.${u.label === 'Merah' ? ' Sarankan segera ke Puskesmas.' : ''}</p>
    <div class="deret-tombol">
      ${berikut ? `<button class="tombol" data-aksi="formPeriksaL" data-id="${esc(berikut.id)}">Berikutnya: ${esc(berikut.nama.split(' ').slice(0, 2).join(' '))} ${ikon('kanan', 18)}</button>` : ''}
      <button class="tombol garis" data-aksi="tutupRender">Selesai</button></div>`);
}

function viewProfilLansia(id) {
  const l = S.d.lansiaById[id];
  if (!l) return { judul: 'Lansia', nav: 'menu', html: '<div class="kosong">Data lansia tidak ditemukan.</div>' };
  const rows = Object.values(S.d.periksaL[id] || {}).sort((a, c) => (a.periode < c.periode ? 1 : -1)), t = rows[0];
  const aktif = l.status === 'Aktif' || l.status === 'Menunggu', ket = (k, v) => `<tr><td class="redup">${k}</td><td>${v}</td></tr>`;
  const yt = v => v === 'Y' ? 'Ya' : v === 'T' ? 'Tidak' : '–';
  return { judul: l.nama, nav: 'menu', html: `
    <div class="kartu">
      <div class="baris"><span class="avatar ${l.jk}" style="width:52px;height:52px;font-size:1.1rem">${esc(inisial(l.nama))}</span>
        <div style="flex:1"><div style="font-weight:700;font-size:1.1rem">${esc(l.nama)}</div>
        <div class="redup kecil">${l.jk === 'L' ? 'Laki-laki' : 'Perempuan'} · ${usiaTh(l.tglLahir)} th · ${esc(l.posyandu)}</div></div>
        <span class="lbl ${l.status === 'Aktif' ? 'Hijau' : l.status === 'Menunggu' ? 'Kuning' : 'Abu'}">${esc(l.status)}</span></div>
      ${l.usulKeluar ? `<div class="pesan-awas" style="margin-top:12px">Diusulkan keluar (${esc(l.usulKeluar)}), menunggu persetujuan admin.</div>` : ''}
      <div class="tabel-wrap"><table style="margin-top:8px">
        ${ket('Tanggal lahir', fmtTgl(l.tglLahir))}${ket('NIK', esc(l.nik || '–'))}${ket('No KK', esc(l.kk || '–'))}
        ${ket('RT / RW', rtRw(l).slice(6))}${ket('Dusun', esc(l.dusun || '–'))}
        ${l.hp ? ket('No HP', `<a href="tel:${esc(l.hp)}">${esc(l.hp)}</a>`) : ''}
        ${ket('Riwayat hipertensi', yt(l.rHT))}${ket('Riwayat diabetes', yt(l.rDM))}
        ${l.catatan ? ket('Catatan', esc(l.catatan)) : ''}${l.tglKeluar ? ket('Keluar', fmtTgl(l.tglKeluar)) : ''}
      </table></div>
      <div class="deret-tombol" style="margin-top:12px">
        ${aktif ? `<button class="tombol" data-aksi="formPeriksaLP" data-id="${esc(id)}" data-p="${periodeKini()}">${ikon('ukur', 20)} Periksa</button>` : ''}
        <button class="tombol garis" data-aksi="ke" data-ke="ubah-lansia/${esc(id)}">Ubah data</button>
        ${aktif && !l.usulKeluar ? `<button class="tombol garis" data-aksi="keluarL" data-id="${esc(id)}">Keluarkan</button>` : ''}
      </div>
    </div>
    ${t ? `<div class="kartu"><div class="baris antara"><h2 style="margin:0">Terakhir: ${namaPeriode(t.periode)}</h2><span class="lbl ${t.label}">${t.label}</span></div>
      <div class="grid2" style="margin-top:10px">
        <div class="angka"><b>${tdTeks(t)}</b><span>Tekanan darah · ${esc(t.stTD || '–')}</span></div>
        <div class="angka"><b>${angka(t.imt)}</b><span>IMT · ${esc(t.stIMT || '–')}</span></div>
        <div class="angka"><b>${angka(t.lp)}</b><span>Lingkar perut (cm) · ${esc(t.stLP || '–')}</span></div>
        <div class="angka"><b>${angka(t.bb)}</b><span>Berat badan (kg)</span></div></div>
      ${t.alasan ? `<p class="kecil" style="margin:10px 0 0">${esc(t.alasan)}</p>` : ''}</div>` : ''}
    <div class="kartu"><h2>Riwayat pemeriksaan</h2>${rows.length ? `<div class="tabel-wrap"><table>
      <tr><th>Bulan</th><th class="angka-sel">TD</th><th class="angka-sel">BB</th><th class="angka-sel">IMT</th><th class="angka-sel">LP</th><th>Label</th></tr>
      ${rows.map(r => `<tr class="bisa-ketuk" data-aksi="formPeriksaLP" data-id="${esc(id)}" data-p="${r.periode}"><td>${namaPeriode(r.periode).slice(0, 3)} ${r.periode.slice(2, 4)}${r._lokal ? ' ⏳' : ''}</td>
        <td class="angka-sel">${tdTeks(r)}</td><td class="angka-sel">${angka(r.bb)}</td><td class="angka-sel">${angka(r.imt)}</td><td class="angka-sel">${angka(r.lp)}</td><td><span class="lbl ${r.label}">${r.label}</span></td></tr>`).join('')}</table></div>
      <p class="redup kecil" style="margin:8px 0 0">Ketuk baris untuk melihat atau memperbaiki.</p>` : '<div class="redup">Belum ada pemeriksaan.</div>'}</div>
    <p class="redup kecil">Label adalah penanda dini, bukan diagnosis.</p>` };
}

function viewFormLansia(id) {
  const l = id ? S.d.lansiaById[id] : null;
  const v = k => l ? esc(l[k] === undefined || l[k] === null ? '' : l[k]) : '';
  const yt = (nama, val) => `<select name="${nama}"><option value="">Tidak tahu</option><option value="T" ${val === 'T' ? 'selected' : ''}>Tidak</option><option value="Y" ${val === 'Y' ? 'selected' : ''}>Ya</option></select>`;
  const dusun = [...new Set(S.d.lansia.map(x => x.dusun).filter(Boolean))].sort();
  return { judul: l ? 'Ubah data lansia' : 'Tambah lansia', nav: 'menu', html: `
    <form id="fLansia" class="kartu" data-id="${l ? esc(l.id) : ''}">
      <label class="isian"><span>Nama lengkap * (sesuai KTP/KK)</span><input name="nama" value="${v('nama')}" required autocapitalize="characters" maxlength="60"></label>
      <div class="grid2">
        <label class="isian"><span>Jenis kelamin *</span><select name="jk" required><option value="">Pilih…</option><option value="L" ${l && l.jk === 'L' ? 'selected' : ''}>Laki-laki</option><option value="P" ${l && l.jk === 'P' ? 'selected' : ''}>Perempuan</option></select></label>
        <label class="isian"><span>Tanggal lahir *</span><input type="date" name="tglLahir" value="${v('tglLahir')}" max="${hariIni()}" required></label>
      </div>
      <label class="isian"><span>NIK (16 angka)</span><input name="nik" inputmode="numeric" maxlength="16" placeholder="${l && l.nik ? esc(l.nik) + ' — isi untuk mengganti' : 'Kosongkan jika tidak tahu'}" value="${admin() ? v('nik') : ''}"></label>
      <label class="isian"><span>No KK (16 angka)</span><input name="kk" inputmode="numeric" maxlength="16" placeholder="${l && l.kk ? esc(l.kk) + ' — isi untuk mengganti' : ''}" value="${admin() ? v('kk') : ''}"></label>
      <div class="grid3">
        <label class="isian"><span>RT</span><input name="rt" inputmode="numeric" maxlength="3" placeholder="001" value="${l && l.rt ? String(l.rt).padStart(3, '0') : ''}"></label>
        <label class="isian"><span>RW</span><input name="rw" inputmode="numeric" maxlength="3" placeholder="002" value="${l && l.rw ? String(l.rw).padStart(3, '0') : ''}"></label>
        <label class="isian"><span>Dusun</span><input name="dusun" list="daftarDusun" value="${v('dusun')}" autocapitalize="characters"><datalist id="daftarDusun">${dusun.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
      </div>
      ${admin() ? `<label class="isian"><span>Posyandu *</span><select name="posyandu" required>${S.d.posyandu.map(p => `<option ${(l ? l.posyandu : S.pos) === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>` : ''}
      <label class="isian"><span>No HP</span><input name="hp" type="tel" inputmode="tel" maxlength="16" placeholder="Contoh: 081234567890" value="${v('hp')}"></label>
      <div class="grid2">
        <label class="isian"><span>Riwayat hipertensi</span>${yt('rHT', l ? l.rHT : '')}</label>
        <label class="isian"><span>Riwayat diabetes</span>${yt('rDM', l ? l.rDM : '')}</label>
      </div>
      <label class="isian"><span>Catatan</span><input name="catatan" maxlength="200" value="${v('catatan')}"></label>
      <div id="galatLs"></div>
      <button class="tombol penuh" type="submit">Simpan</button>
    </form>` };
}

async function simpanLansiaForm(f) {
  const nik = f.nik.value.replace(/\D/g, ''), kk = f.kk.value.replace(/\D/g, ''), nama = rapiNama(f.nama.value);
  const rt = rapiRT(f.rt.value), rw = rapiRT(f.rw.value), hp = rapiHP(f.hp.value), prov = n => +n.slice(0, 2) >= 11 && +n.slice(0, 2) <= 94;
  const err = nama.length < 2 ? 'Nama wajib diisi.' : !namaSah(nama) ? 'Nama hanya boleh huruf, spasi, titik, koma, apostrof, dan tanda hubung.'
    : !f.jk.value ? 'Pilih jenis kelamin.' : !f.tglLahir.value ? 'Tanggal lahir wajib diisi.' : usiaTh(f.tglLahir.value) < 60 ? 'Usia belum 60 tahun.'
    : nik && (nik.length !== 16 || !prov(nik)) ? 'NIK harus 16 angka dengan kode provinsi yang sah.' : kk && (kk.length !== 16 || !prov(kk)) ? 'No KK harus 16 angka dengan kode provinsi yang sah.'
    : nik && nik === kk ? 'NIK dan No KK tidak boleh sama.' : +rt > 999 || +rw > 999 ? 'RT/RW diisi angka 1 sampai 3 digit, contoh 001.'
    : hp && !/^08\d{8,11}$/.test(hp) ? 'No HP harus diawali 08 dan berisi 10–13 angka, contoh 081234567890.' : '';
  if (err) { $('#galatLs').innerHTML = `<div class="pesan-galat">${esc(err)}</div>`; return; }
  const id = f.dataset.id || idBaru('LNS-K');
  const x = { id, nama, jk: f.jk.value, tglLahir: f.tglLahir.value, nik, kk, rt, rw, dusun: rapiNama(f.dusun.value), hp, rHT: f.rHT.value, rDM: f.rDM.value,
    catatan: rapiSpasi(f.catatan.value), posyandu: f.posyandu ? f.posyandu.value : S.sesi.user.posyandu };
  if (!f.dataset.id && nama && S.d.lansia.some(z => z.nama === nama && z.tglLahir === x.tglLahir) &&
      !await konfirmasi('Data mungkin ganda', esc(nama) + ' dengan tanggal lahir yang sama sudah ada. Tetap simpan?', 'Tetap simpan')) return;
  await antrekan('simpanLansia', x, (f.dataset.id ? 'Ubah lansia ' : 'Tambah lansia ') + nama);
  toast('Data lansia tersimpan.');
  location.hash = '#/lansia-profil/' + encodeURIComponent(id);
}

function formKeluarL(id) {
  const l = S.d.lansiaById[id];
  bukaLembar(`<h3>Keluarkan dari daftar lansia</h3><div class="redup kecil" style="margin-bottom:12px">${esc(l.nama)}. ${admin() ? 'Langsung berlaku.' : 'Usulan akan disetujui admin.'} Data tidak dihapus.</div>
    <form id="fKeluarL" data-id="${esc(id)}">
      <label class="isian"><span>Alasan</span><select name="alasan" required><option value="">Pilih…</option><option>Meninggal</option><option>Pindah</option><option>Lainnya</option></select></label>
      <label class="isian"><span>Tanggal</span><input type="date" name="tanggal" value="${hariIni()}" max="${hariIni()}" required></label>
      <label class="isian"><span>Keterangan</span><input name="keterangan" maxlength="120"></label>
      <button class="tombol bahaya penuh" type="submit">${admin() ? 'Keluarkan' : 'Kirim usulan'}</button>
      <button type="button" class="tombol garis penuh" style="margin-top:10px" data-aksi="tutup">Batal</button>
    </form>`);
}

function lansiaMerah() {
  const P = periodeKini(), P1 = geserPeriode(P, -1);
  return sasaranLansia().map(l => ({ l, u: periksaDi(l.id, P) || periksaDi(l.id, P1) })).filter(x => x.u && x.u.label === 'Merah').sort((a, c) => urutNama(a.l, c.l));
}

/* ---------- Imunisasi ---------- */
function viewImunisasi() {
  const P = periodeKini(), perVit = periodeVitA(P), sas = sasaran(P);
  let list = [];
  if (S.tabImun === 'KPSP') list = sas.map(b => ({ b, uk: kpspTempo(b) })).filter(x => x.uk).map(x => ({ b: x.b, ket: 'KPSP ' + x.uk + ' bulan' }));
  else if (S.tabImun === 'Vitamin A') list = sas.filter(b => { const u = usiaBulan(b.tglLahir, hariIni()); return u >= 6 && u <= 59 && !vitASudah(b, perVit); })
    .map(b => ({ b, ket: jenisVitA(usiaBulan(b.tglLahir, hariIni())) === 'VitA_Biru' ? 'Kapsul biru' : 'Kapsul merah' }));
  else list = sas.map(b => ({ b, v: statusImun(b).list.filter(x => x.status === S.tabImun) })).filter(x => x.v.length)
    .map(x => ({ b: x.b, ket: x.v.map(v => v.nama).join(', ') }));
  list.sort((a, c) => urutNama(a.b, c.b));
  return { judul: 'Imunisasi & Vitamin', html: `
    ${admin() ? pilihPosyandu() : ''}
    <div class="chips" style="flex-wrap:wrap">${['Jatuh tempo', 'Terlambat', 'Vitamin A', 'KPSP'].map(t => `<button class="chip ${S.tabImun === t ? 'aktif' : ''}" data-aksi="tabImun" data-t="${t}">${t}</button>`).join('')}</div>
    ${S.tabImun === 'Vitamin A' ? `<div class="pesan-info">Periode vitamin A: ${namaPeriode(perVit)} (Februari dan Agustus). Daftar ini anak 6–59 bulan yang belum tercatat.</div>`
      : S.tabImun === 'KPSP' ? '<div class="pesan-info">Anak yang jadwal KPSP (pemeriksaan perkembangan) usianya sudah tercapai tetapi belum dicatat.</div>'
      : S.tabImun === 'Terlambat' ? '<div class="pesan-info">Lewat usia jadwal: perlu imunisasi kejar. Konsultasikan dengan bidan desa.</div>' : ''}
    <div class="baris antara" style="margin:0 4px 8px"><span class="redup kecil">${list.length} balita</span>
      ${list.length ? '<button class="tombol garis kecil" data-aksi="salinWA">Salin untuk WhatsApp</button>' : ''}</div>
    ${list.length ? `<div class="daftar">${list.map(x => `<button class="item" data-aksi="ke" data-ke="balita/${esc(x.b.id)}">
      <span class="avatar ${x.b.jk}">${esc(inisial(x.b.nama))}</span>
      <span class="isi"><div class="nama">${esc(x.b.nama)}</div><div class="sub">${usiaTeks(usiaBulan(x.b.tglLahir, hariIni()))} · Ibu ${esc(x.b.ibu || '–')} · ${rtRw(x.b)}</div><div class="sub" style="white-space:normal;color:var(--teks)">${esc(x.ket)}</div></span>${ikon('kanan', 18)}</button>`).join('')}</div>`
      : '<div class="kosong">Tidak ada balita dalam daftar ini.</div>'}`,
    data: list };
}

/* ---------- Risiko ---------- */
function viewRisiko() {
  const r = daftarRisiko();
  const item = (x, absen) => `<button class="item" data-aksi="${absen ? 'ke' : 'formTL'}" data-id="${esc(x.b.id)}" data-ke="balita/${esc(x.b.id)}">
    <span class="avatar ${x.b.jk}">${esc(inisial(x.b.nama))}</span>
    <span class="isi"><div class="nama">${esc(x.b.nama)}</div>
      <div class="sub${absen ? '' : ' dua'}">${absen ? 'Terakhir ditimbang ' + namaPeriode(x.u.periode) : esc(x.u.alasan)}</div>
      <div class="sub">Ibu ${esc(x.b.ibu || '–')} · ${rtRw(x.b)}${admin() && !S.pos ? ' · ' + esc(x.b.posyandu) : ''}${x.skor ? ' · skor ' + x.skor : ''}</div></span>
    ${absen ? ikon('kanan', 18) : `<span class="lbl ${!x.t ? 'Abu' : x.t.Status === 'Belum' ? 'Merah' : x.t.Status === 'Sedang' ? 'Biru' : 'Hijau'}">${x.t ? esc(x.t.Status) : 'Belum'}</span>`}</button>`;
  const bagian = (judul, l, absen) => `<div class="judul-bagian">${judul} (${l.length})</div>` + (l.length ? `<div class="daftar">${l.map(x => item(x, absen)).join('')}</div>` : '<div class="kosong" style="padding:14px">Tidak ada.</div>');
  return { judul: 'Risiko & Tindak Lanjut', html: `
    ${admin() ? pilihPosyandu() : ''}
    <div class="pesan-info">Berdasarkan pengukuran ${namaPeriode(periodeKini())} (atau bulan lalu bila belum diukur). Ketuk nama untuk mencatat rujukan dan intervensi.</div>
    ${pd3iAktif().length ? `<div class="judul-bagian" style="color:var(--merah)">Suspek PD3I aktif (${pd3iAktif().length})</div><div class="daftar">${pd3iAktif().map(itemPD3I).join('')}</div>` : ''}
    ${bagian('Merah — perlu rujukan', r.Merah)}${bagian('Kuning — waspada', r.Kuning)}
    ${(() => { const l = lansiaMerah(); return l.length ? `<div class="judul-bagian">Lansia — perlu rujukan (${l.length})</div><div class="daftar">${l.map(x => `<button class="item" data-aksi="ke" data-ke="lansia-profil/${esc(x.l.id)}">
      <span class="avatar ${x.l.jk}">${esc(inisial(x.l.nama))}</span><span class="isi"><div class="nama">${esc(x.l.nama)}</div>
      <div class="sub dua">${esc(x.u.alasan)}</div><div class="sub">${usiaTh(x.l.tglLahir)} th · ${rtRw(x.l)} · ${esc(namaPeriode(x.u.periode))}${admin() && !S.pos ? ' · ' + esc(x.l.posyandu) : ''}</div></span>
      <span class="lbl Merah">Merah</span></button>`).join('')}</div>` : ''; })()}${bagian('Tidak ditimbang 2 bulan atau lebih', r.Absen, true)}
    ${(() => { const l = kpspPerlu(); return `<div class="judul-bagian">Perkembangan perlu tindak lanjut (${l.length})</div>` + (l.length ? `<div class="daftar">${l.map(x => `<button class="item" data-aksi="ke" data-ke="balita/${esc(x.b.id)}">
      <span class="avatar ${x.b.jk}">${esc(inisial(x.b.nama))}</span><span class="isi"><div class="nama">${esc(x.b.nama)}</div>
      <div class="sub">KPSP ${x.k.usia} bulan · ${fmtTgl(x.k.tgl)} · ${x.k.hasil === 'Meragukan' ? 'periksa ulang 2 minggu' : 'rujuk ke Puskesmas'}</div>
      <div class="sub">Ibu ${esc(x.b.ibu || '–')} · ${rtRw(x.b)}${admin() && !S.pos ? ' · ' + esc(x.b.posyandu) : ''}</div></span>
      <span class="lbl ${WARNA_KPSP[x.k.hasil]}">${x.k.hasil}</span></button>`).join('')}</div>` : '<div class="kosong" style="padding:14px">Tidak ada.</div>'); })()}
    <p class="redup kecil">Label adalah penanda dini. Penentuan status dan penanganan oleh tenaga kesehatan.</p>` };
}

/* ---------- Menu ---------- */
function viewMenu() {
  const { m, g } = hitungAntrean(), u = S.d.user;
  const item = (ke, judul, sub, aksi) => `<button class="item" data-aksi="${aksi || 'ke'}" data-ke="${ke}"><span class="isi"><div class="nama">${judul}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</span>${ikon('kanan', 18)}</button>`;
  return { judul: 'Menu', html: `
    <div class="kartu"><b>${esc(u.nama)}</b><div class="redup kecil">${esc(u.username)} · ${u.peran === 'admin' ? 'Admin desa' : 'Kader ' + esc(u.posyandu)}</div></div>
    <div class="daftar">
      ${item('antrean', 'Antrean kiriman', m + g ? `${m} menunggu, ${g} gagal` : 'Semua sudah terkirim')}
      ${item('', 'Sinkron sekarang', 'Ambil data terbaru dari server', 'sinkron')}
      ${item('data-balita', 'Data balita', 'Daftar, cari, tambah, ubah')}
      ${item('tambah-balita', 'Tambah balita', 'Bayi lahir, pindah datang, baru terdata')}
      ${item('lansia', 'Lansia', 'Pemeriksaan bulanan lansia 60+')}
      ${item('tambah-lansia', 'Tambah lansia', 'Lansia baru terdata atau usia 70+')}
      ${item('akun', 'Ganti PIN', '')}
      ${item('', 'Periksa pembaruan', 'Versi ' + esc(C.VERSI) + ' · ketuk untuk memuat versi terbaru', 'cekPembaruan')}
    </div>
    ${admin() ? `<div class="judul-bagian">Admin</div><div class="daftar">
      ${item('pantau', 'Pantau penimbangan', 'Progres tiap posyandu bulan ini')}
      ${item('dashboard', 'Dashboard desa', 'Rekap dan tren 12 bulan')}
      ${item('persetujuan', 'Persetujuan', 'Balita baru dan usulan keluar')}
      ${item('laporan', 'Laporan Excel', 'Buat dan unduh laporan bulanan')}
      ${item('pengguna', 'Akun kader', 'Tambah, ubah PIN, nonaktifkan')}
      ${item('kunci', 'Kunci periode', 'Kunci bulan yang sudah dilaporkan')}
    </div>` : ''}
    <div class="daftar" style="margin-top:12px">
      ${S.pasang ? item('', 'Pasang aplikasi di layar HP', '', 'pasang') : ''}
      ${item('', 'Keluar', 'Hapus data dari HP ini', 'keluar')}
    </div>
    <p class="redup kecil" style="text-align:center">${esc(C.NAMA)} versi ${esc(C.VERSI)} · ${esc(S.d.desa)}</p>` };
}

function viewAntrean() {
  const l = S.antrean.slice().sort((a, b) => a.waktu - b.waktu);
  return { judul: 'Antrean kiriman', nav: 'menu', html: `
    <div class="pesan-info">Data di sini tersimpan di HP dan dikirim otomatis saat ada sinyal. Jangan hapus data Chrome atau copot aplikasi sebelum antrean kosong.</div>
    <button class="tombol penuh" data-aksi="kirimSekarang" ${l.length ? '' : 'disabled'}>Kirim sekarang</button>
    <div class="judul-bagian">${l.length} data</div>
    ${l.length ? `<div class="daftar">${l.map(it => `<div class="item" style="cursor:default"><span class="isi"><div class="nama">${esc(it.label)}</div>
      <div class="sub">${new Date(it.waktu).toLocaleString('id-ID')}</div>${it.status === 'gagal' ? `<div class="sub" style="color:var(--merah);white-space:normal">${esc(it.pesan)}</div>` : ''}</span>
      ${it.status === 'gagal' ? `<div class="deret-tombol" style="flex:none"><button class="tombol garis kecil" data-aksi="ulangi" data-q="${it.qid}">Ulangi</button><button class="tombol bahaya kecil" data-aksi="buang" data-q="${it.qid}">Buang</button></div>`
        : `<span class="lbl ${it.status === 'kirim' ? 'Biru' : 'Kuning'}">${it.status === 'kirim' ? 'Mengirim' : 'Menunggu'}</span>`}</div>`).join('')}</div>` : '<div class="kosong">Antrean kosong. Semua data sudah terkirim.</div>'}` };
}

/* ---------- Data balita ---------- */
function viewDataBalita() {
  const filter = admin() ? ['Aktif', 'Menunggu', 'Keluar'] : ['Aktif', 'Menunggu'];
  return { judul: 'Data balita', nav: 'menu', html: `
    ${admin() ? pilihPosyandu() : ''}
    <div class="cari">${ikon('cari', 20)}<input id="cariB" type="search" placeholder="Cari nama, nama ibu, atau NIK" value="${esc(S.cariB || '')}" autocomplete="off"></div>
    <div class="chips">${filter.map(f => `<button class="chip ${S.filterBalita === f ? 'aktif' : ''}" data-aksi="filterBalita" data-f="${f}">${f}</button>`).join('')}</div>
    <button class="tombol garis penuh" data-aksi="ke" data-ke="tambah-balita" style="margin-bottom:10px">${ikon('tambah', 20)} Tambah balita</button>
    <div id="daftarB"></div>`,
    setelah: () => { isiDataBalita(); const c = $('#cariB'); c.addEventListener('input', () => { S.cariB = c.value; isiDataBalita(); }); } };
}
async function isiDataBalita() {
  const el = $('#daftarB'); if (!el) return;
  let l = S.d.balita.filter(b => posTerpilih(b) && (S.filterBalita === 'Keluar' ? ['Lulus', 'Pindah', 'Meninggal', 'Ditolak'].indexOf(b.status) >= 0 : b.status === S.filterBalita));
  l = (await cocokCari(l, S.cariB)).sort(urutNama);
  el.innerHTML = `<p class="redup kecil" style="margin:0 4px 8px">${l.length} balita</p>` + (l.length ? `<div class="daftar">${l.slice(0, 400).map(b => `<button class="item" data-aksi="ke" data-ke="balita/${esc(b.id)}">
    <span class="avatar ${b.jk}">${esc(inisial(b.nama))}</span><span class="isi"><div class="nama">${esc(b.nama)}${b._lokal ? ' ⏳' : ''}</div>
    <div class="sub">${b.tglLahir ? usiaTeks(usiaBulan(b.tglLahir, hariIni())) : 'tgl lahir kosong'} · Ibu ${esc(b.ibu || '–')} · ${rtRw(b)}${admin() && !S.pos ? ' · ' + esc(b.posyandu) : ''}</div></span>
    ${S.filterBalita === 'Keluar' ? `<span class="lbl Abu">${esc(b.status)}</span>` : ikon('kanan', 18)}</button>`).join('')}</div>` : '<div class="kosong">Tidak ada data.</div>');
}

function viewFormBalita(id) {
  const b = id ? S.d.byId[id] : null;
  const v = k => b ? esc(b[k] === undefined || b[k] === null ? '' : b[k]) : '';
  return { judul: b ? 'Ubah data balita' : 'Tambah balita', nav: 'menu', html: `
    <form id="fBalita" class="kartu" data-id="${b ? esc(b.id) : ''}">
      ${!b ? `<label class="isian"><span>Alasan masuk</span><select name="alasanMasuk"><option>Lahir</option><option>Pindah datang</option><option>Baru terdata</option></select></label>` : ''}
      <label class="isian"><span>Nama balita * (sesuai KK/akta)</span><input name="nama" value="${v('nama')}" required autocapitalize="characters" maxlength="60" placeholder="Contoh: AHMAD FAUZI"></label>
      <div class="grid2">
        <label class="isian"><span>Jenis kelamin *</span><select name="jk" required><option value="">Pilih…</option><option value="L" ${b && b.jk === 'L' ? 'selected' : ''}>Laki-laki</option><option value="P" ${b && b.jk === 'P' ? 'selected' : ''}>Perempuan</option></select></label>
        <label class="isian"><span>Tanggal lahir *</span><input type="date" name="tglLahir" value="${v('tglLahir')}" max="${hariIni()}" required></label>
      </div>
      <label class="isian"><span>NIK (16 angka)</span><input name="nik" inputmode="numeric" maxlength="16" placeholder="${b && b.nik ? esc(b.nik) + ' — isi untuk mengganti' : 'Kosongkan jika belum punya'}" value="${admin() ? v('nik') : ''}"></label>
      <label class="isian"><span>No KK (16 angka)</span><input name="kk" inputmode="numeric" maxlength="16" placeholder="${b && b.kk ? esc(b.kk) + ' — isi untuk mengganti' : ''}" value="${admin() ? v('kk') : ''}"></label>
      <div class="grid2">
        <label class="isian"><span>Nama ayah</span><input name="ayah" value="${v('ayah')}" autocapitalize="characters" maxlength="60"></label>
        <label class="isian"><span>Nama ibu</span><input name="ibu" value="${v('ibu')}" autocapitalize="characters" maxlength="60"></label>
      </div>
      <div class="grid3">
        <label class="isian"><span>RT</span><input name="rt" inputmode="numeric" maxlength="3" placeholder="001" value="${b && b.rt ? String(b.rt).padStart(3, '0') : ''}"></label>
        <label class="isian"><span>RW</span><input name="rw" inputmode="numeric" maxlength="3" placeholder="002" value="${b && b.rw ? String(b.rw).padStart(3, '0') : ''}"></label>
        <label class="isian"><span>Prematur</span><select name="prematur"><option value="T">Tidak</option><option value="Y" ${b && b.prematur === 'Y' ? 'selected' : ''}>Ya</option></select></label>
      </div>
      ${admin() ? `<label class="isian"><span>Posyandu *</span><select name="posyandu" required>${S.d.posyandu.map(p => `<option ${(b ? b.posyandu : S.pos) === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>` : ''}
      <div class="grid2">
        <label class="isian"><span>Berat lahir (gram)</span><input name="bbLahir" inputmode="decimal" placeholder="Contoh: 3200" value="${v('bbLahir')}"></label>
        <label class="isian"><span>Panjang lahir (cm)</span><input name="pbLahir" inputmode="decimal" placeholder="Contoh: 49,5" value="${b ? esc(angka(b.pbLahir).replace('–', '')) : ''}"></label>
      </div>
      <label class="isian"><span>No HP orang tua</span><input name="hp" type="tel" inputmode="tel" maxlength="16" placeholder="Contoh: 081234567890" value="${v('hp')}"></label>
      <label class="isian"><span>Catatan</span><input name="catatan" maxlength="200" value="${v('catatan')}"></label>
      <div id="galatB"></div>
      <button class="tombol penuh" type="submit">Simpan</button>
    </form>` };
}

async function simpanBalitaForm(f) {
  const nik = f.nik.value.replace(/\D/g, ''), kk = f.kk.value.replace(/\D/g, '');
  const nama = rapiNama(f.nama.value), ayah = rapiNama(f.ayah.value), ibu = rapiNama(f.ibu.value);
  const rt = rapiRT(f.rt.value), rw = rapiRT(f.rw.value), hp = rapiHP(f.hp.value);
  const bbLahir = gramLahir(f.bbLahir.value), pbLahir = bacaAngka(f.pbLahir.value);
  const err = nama.length < 2 ? 'Nama wajib diisi.' : !namaSah(nama) ? 'Nama hanya boleh huruf, spasi, titik, koma, apostrof, dan tanda hubung.'
    : (ayah && !namaSah(ayah)) || (ibu && !namaSah(ibu)) ? 'Nama ayah/ibu hanya boleh huruf, spasi, titik, koma, apostrof, dan tanda hubung.'
    : !f.jk.value ? 'Pilih jenis kelamin.' : !f.tglLahir.value ? 'Tanggal lahir wajib diisi.'
    : f.tglLahir.value > hariIni() ? 'Tanggal lahir setelah hari ini.' : usiaBulan(f.tglLahir.value, hariIni()) >= 60 ? 'Usia sudah 60 bulan atau lebih.'
    : nik && nik.length !== 16 ? 'NIK harus 16 angka.' : nik && (+nik.slice(0, 2) < 11 || +nik.slice(0, 2) > 94) ? 'NIK tidak sah: 2 angka pertama harus kode provinsi (11–94).'
    : kk && kk.length !== 16 ? 'No KK harus 16 angka.' : kk && (+kk.slice(0, 2) < 11 || +kk.slice(0, 2) > 94) ? 'No KK tidak sah: 2 angka pertama harus kode provinsi (11–94).'
    : nik && nik === kk ? 'NIK dan No KK tidak boleh sama.'
    : (f.rt.value.trim() && !rt) || +rt > 999 || (f.rw.value.trim() && !rw) || +rw > 999 ? 'RT/RW diisi angka 1 sampai 3 digit, contoh 001.'
    : hp && !/^08\d{8,11}$/.test(hp) ? 'No HP harus diawali 08 dan berisi 10–13 angka, contoh 081234567890.'
    : Number.isNaN(bbLahir) || (bbLahir !== '' && (bbLahir < 500 || bbLahir > 6000)) ? 'Berat lahir diisi dalam gram (500–6.000), contoh 3200.'
    : Number.isNaN(pbLahir) || (pbLahir !== '' && (pbLahir < 25 || pbLahir > 65)) ? 'Panjang lahir diisi dalam cm (25–65), contoh 49,5.' : '';
  if (err) { $('#galatB').innerHTML = `<div class="pesan-galat">${esc(err)}</div>`; return; }
  const cocokNIK = infoNIK(nik);
  if (cocokNIK && (cocokNIK.tgl !== f.tglLahir.value || cocokNIK.jk !== f.jk.value) && !await konfirmasi('Periksa NIK',
    `Menurut NIK, anak ini ${cocokNIK.jk === 'L' ? 'laki-laki' : 'perempuan'} lahir ${fmtTgl(cocokNIK.tgl)}, berbeda dengan isian. Tetap simpan?`, 'Tetap simpan')) return;
  const id = f.dataset.id || idBaru('BLT-K');
  const x = { id, nama, jk: f.jk.value, tglLahir: f.tglLahir.value, nik, kk, ayah, ibu, rt, rw, prematur: f.prematur.value, bbLahir, pbLahir,
    hp, catatan: rapiSpasi(f.catatan.value), posyandu: f.posyandu ? f.posyandu.value : S.sesi.user.posyandu };
  if (!f.dataset.id) x.alasanMasuk = f.alasanMasuk.value;
  if (!f.dataset.id && nik) {
    const h = await sha12(nik);
    const ganda = S.d.balita.find(b => b.nikHash === h || (admin() && b.nik === nik));
    if (ganda && !await konfirmasi('NIK sudah ada', esc(ganda.nama) + ' memakai NIK ini. Tetap simpan?', 'Tetap simpan')) return;
  }
  await antrekan('simpanBalita', x, (f.dataset.id ? 'Ubah ' : 'Tambah ') + x.nama.toUpperCase());
  toast('Data balita tersimpan.');
  location.hash = '#/balita/' + encodeURIComponent(id);
}

/* ---------- Admin (perlu sinyal) ---------- */
function perluSinyal(judul, nav, isi) { return { judul, nav: nav || 'menu', html: `<div id="isiOnline"><div class="muat"><div class="spinner gelap"></div> Memuat…</div></div>${isi || ''}` }; }
function tampilGagal(r) { const el = $('#isiOnline'); if (el) el.innerHTML = `<div class="pesan-galat">${esc(r.pesan)}</div><button class="tombol garis penuh" data-aksi="muatUlang">Coba lagi</button>`; }

function viewDashboard() {
  const v = perluSinyal('Dashboard desa');
  v.setelah = async () => {
    if (!S.periodeDash) S.periodeDash = periodeKini();
    const r = await api('dashboard', { periode: S.periodeDash }, { batas: 90000 });
    const el = $('#isiOnline'); if (!el) return;
    if (!r.ok) return tampilGagal(r);
    const d = r.data, t = d.rekap.total, per = d.rekap.perPosyandu;
    const ps = []; for (let i = 0; i < 24; i++) ps.push(geserPeriode(periodeKini(), -i));
    el.innerHTML = `
      <label class="isian"><span>Periode</span><select data-ubah="periodeDash">${ps.map(p => `<option value="${p}" ${p === S.periodeDash ? 'selected' : ''}>${namaPeriode(p)}</option>`).join('')}</select></label>
      <div class="grid3">
        <div class="angka"><b>${t.S}</b><span>Sasaran (S)</span></div>
        <div class="angka"><b>${t.D}</b><span>Ditimbang · ${angka(t.D_S_Persen)}%</span></div>
        <div class="angka oke"><b>${angka(t.N_D_Persen)}%</b><span>Naik (N/D)</span></div>
        <div class="angka merah"><b>${t.Stunting}</b><span>Stunting · ${angka(t.Stunting_Persen)}%</span></div>
        <div class="angka merah"><b>${t.Wasting}</b><span>Wasting</span></div>
        <div class="angka kuning"><b>${t.Underweight}</b><span>Underweight</span></div>
        <div class="angka merah"><b>${t.Merah}</b><span>Label merah</span></div>
        <div class="angka ${d.tlTerlambat ? 'merah' : ''}"><b>${d.tlTerlambat}</b><span>Merah belum ditangani &gt; 14 hari</span></div>
        <button class="angka ${d.menunggu ? 'kuning' : ''}" data-aksi="ke" data-ke="persetujuan"><b>${d.menunggu}</b><span>Menunggu persetujuan</span></button>
        ${d.lansia ? `<button class="angka" data-aksi="ke" data-ke="pantau"><b>${d.lansia.D}/${d.lansia.S}</b><span>Lansia diperiksa</span></button>
        <div class="angka ${d.lansia.HT ? 'kuning' : ''}"><b>${d.lansia.HT}</b><span>Lansia hipertensi</span></div>
        <div class="angka ${d.lansia.Merah ? 'merah' : ''}"><b>${d.lansia.Merah}</b><span>Lansia label merah</span></div>` : ''}
        <button class="angka ${d.pd3iAktif ? 'merah' : ''}" data-aksi="ke" data-ke="risiko"><b>${d.pd3iAktif || 0}</b><span>Suspek PD3I aktif</span></button>
        <button class="angka ${d.kpspPerluRujuk ? 'kuning' : ''}" data-aksi="ke" data-ke="risiko"><b>${d.kpspPerluRujuk || 0}</b><span>KPSP meragukan/penyimpangan</span></button>
      </div>
      <div class="kartu" style="margin-top:12px"><h2>Tren 12 bulan</h2>${grafikTren(d.tren)}</div>
      <div class="kartu"><h2>Per posyandu</h2><div class="tabel-wrap"><table>
        <tr><th>Posyandu</th><th class="angka-sel">S</th><th class="angka-sel">D</th><th class="angka-sel">D/S</th><th class="angka-sel">Stunting</th><th class="angka-sel">Merah</th><th class="angka-sel">IDL</th></tr>
        ${Object.keys(per).map(k => { const x = per[k]; return `<tr><td>${esc(k)}</td><td class="angka-sel">${x.S}</td><td class="angka-sel">${x.D}</td>
          <td class="angka-sel" style="color:${x.S && x.D_S_Persen < 60 ? 'var(--merah)' : 'inherit'}">${x.S ? angka(x.D_S_Persen) + '%' : '–'}</td><td class="angka-sel">${x.Stunting}</td><td class="angka-sel">${x.Merah}</td>
          <td class="angka-sel">${x.IDL}/${x.Sasaran_IDL}</td></tr>`; }).join('')}
        <tr style="font-weight:700"><td>Desa</td><td class="angka-sel">${t.S}</td><td class="angka-sel">${t.D}</td><td class="angka-sel">${angka(t.D_S_Persen)}%</td><td class="angka-sel">${t.Stunting}</td><td class="angka-sel">${t.Merah}</td><td class="angka-sel">${t.IDL}/${t.Sasaran_IDL}</td></tr>
      </table></div></div>
      <p class="redup kecil">Mutasi ${namaPeriode(S.periodeDash)}: ${d.mutasi.masuk} masuk, ${d.mutasi.keluar} keluar. Tindak lanjut terbuka: ${d.tlBuka}.</p>
      <button class="tombol garis penuh" data-aksi="ke" data-ke="pantau" style="margin-bottom:10px">Pantau penimbangan per posyandu</button>
      <button class="tombol penuh" data-aksi="ke" data-ke="laporan">Buat laporan Excel</button>`;
  };
  return v;
}

/* ---------- Pantau penimbangan (admin) ---------- */
const waktuTeks = s => { s = String(s || ''); return s ? fmtTgl(s.slice(0, 10)) + (s.length > 10 ? ' ' + s.slice(11, 16) : '') : ''; };
function viewPantau() {
  const v = perluSinyal('Pantau penimbangan');
  v.setelah = async () => {
    if (!S.periodePantau) S.periodePantau = periodeKini();
    const r = await api('pantau', { periode: S.periodePantau }, { batas: 90000 });
    const el = $('#isiOnline'); if (!el) return;
    if (!r.ok) return tampilGagal(r);
    const d = r.data, ps = [];
    for (let i = 0; i < 12; i++) ps.push(geserPeriode(periodeKini(), -i));
    const mulai = d.posyandu.filter(x => x.D > 0).length;
    const urut = d.posyandu.slice().sort((a, b) => (!a.S - !b.S) || a.persen - b.persen || S.d.posyandu.indexOf(a.posyandu) - S.d.posyandu.indexOf(b.posyandu));
    el.innerHTML = `
      <label class="isian"><span>Periode</span><select data-ubah="periodePantau">${ps.map(p => `<option value="${p}" ${p === S.periodePantau ? 'selected' : ''}>${namaPeriode(p)}</option>`).join('')}</select></label>
      <div class="kartu"><div class="baris antara"><b>${esc(S.d.desa)}</b><span class="persen">${angka(d.total.persen)}%</span></div>
        <div class="besar">${d.total.D} <small>/ ${d.total.S} balita ditimbang</small></div>
        <div class="progres"><i style="width:${Math.min(100, d.total.persen)}%"></i></div>
        <div class="redup kecil">${mulai} dari ${d.posyandu.length} posyandu sudah menginput ${esc(namaPeriode(d.periode))}.</div>
        ${d.total.lansiaS ? `<div class="kecil" style="margin-top:6px">Lansia: <b>${d.total.lansiaD}</b> dari ${d.total.lansiaS} sudah diperiksa</div>` : ''}</div>
      <div class="judul-bagian">Per posyandu (cakupan terendah di atas)</div>
      ${urut.map(x => `<div class="kartu">
        <div class="baris antara"><b>${esc(x.posyandu)}</b><span class="lbl ${!x.S ? 'Abu' : x.D === 0 ? 'Merah' : x.persen < 60 ? 'Kuning' : 'Hijau'}">${!x.S ? 'Tanpa sasaran' : x.D === 0 ? 'Belum input' : angka(x.persen) + '%'}</span></div>
        <div class="progres"><i style="width:${Math.min(100, x.persen)}%"></i></div>
        <div class="kecil">${x.D} dari ${x.S} sudah ditimbang · <b>${x.S - x.D}</b> belum${x.merah ? ` · <span style="color:var(--merah)">${x.merah} label merah</span>` : ''}</div>
        <div class="redup kecil">${x.terakhir ? 'Input terakhir ' + esc(waktuTeks(x.terakhir)) + (x.petugas ? ' oleh ' + esc(x.petugas) : '') : 'Belum ada input pada periode ini'}</div>
        ${x.lansiaS ? `<div class="kecil">Lansia: ${x.lansiaD} dari ${x.lansiaS} sudah diperiksa</div>` : ''}
        <div class="redup kecil">${x.kader.length ? 'Kader: ' + esc(x.kader.join(', ')) : '<span style="color:var(--merah)">Belum ada akun kader aktif</span>'}</div>
        ${x.S - x.D > 0 ? `<button class="tombol garis kecil penuh" style="margin-top:10px" data-aksi="ke" data-ke="belum/${esc(encodeURIComponent(x.posyandu))}">Lihat ${x.S - x.D} balita belum ditimbang</button>` : ''}
      </div>`).join('')}
      <p class="redup kecil">Angka dihitung server dari data yang sudah terkirim. Isian kader yang masih di antrean HP (belum ada sinyal) belum terhitung.</p>`;
  };
  return v;
}

/* Balita belum ditimbang di satu posyandu: dari data di HP admin (bisa offline) */
function viewBelum(pos) {
  const p = S.periodePantau || periodeKini();
  const list = sasaran(p, pos).filter(b => !ukurDi(b.id, p)).sort(urutNama);
  S.daftarBelum = { pos, p, list };
  return { judul: 'Belum ditimbang', nav: 'menu', html: `
    <div class="pesan-info">${esc(pos)} · ${esc(namaPeriode(p))}: <b>${list.length}</b> balita belum ditimbang. Data dari sinkron terakhir HP ini; tekan Sinkron bila perlu.</div>
    <div class="deret-tombol" style="margin-bottom:10px"><button class="tombol garis kecil" data-aksi="sinkron">Sinkron</button>${list.length ? '<button class="tombol garis kecil" data-aksi="salinBelum">Salin untuk WhatsApp</button>' : ''}</div>
    ${list.length ? `<div class="daftar">${list.map(b => { const t = ukurTerakhir(b.id); return `<button class="item" data-aksi="ke" data-ke="balita/${esc(b.id)}">
      <span class="avatar ${b.jk}">${esc(inisial(b.nama))}</span>
      <span class="isi"><div class="nama">${esc(b.nama)}</div><div class="sub">${usiaTeks(usiaBulan(b.tglLahir, hariIni()))} · Ibu ${esc(b.ibu || '–')} · ${rtRw(b)}</div>
      <div class="sub">${t ? 'Terakhir ditimbang ' + esc(namaPeriode(t.periode)) : 'Belum pernah ditimbang'}</div></span>${ikon('kanan', 18)}</button>`; }).join('')}</div>`
      : '<div class="kosong">Semua balita di posyandu ini sudah ditimbang.</div>'}` };
}

function grafikTren(tren) {
  const W = 640, H = 280, L = 62, R = 58, A = 18, B = 40, n = tren.length;
  const X = i => L + i * (W - L - R) / (n - 1);
  const maxS = Math.max(10, ...tren.map(t => t.stuntingPersen)) * 1.2;
  const Yds = v => A + (1 - v / 100) * (H - A - B), Yst = v => A + (1 - v / maxS) * (H - A - B);
  const path = (f, k) => tren.map((t, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + f(t[k]).toFixed(1)).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Tren cakupan penimbangan dan stunting">
    ${[0, 50, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${Yds(v)}" y2="${Yds(v)}" stroke="#e6ece9"/><text x="${L - 8}" y="${Yds(v) + 7}" font-size="20" text-anchor="end" fill="#1468e5">${v}%</text>`).join('')}
    <text x="${W - R + 8}" y="${Yst(0) + 7}" font-size="20" fill="#b42318">0%</text><text x="${W - R + 8}" y="${Yst(maxS / 1.2) + 7}" font-size="20" fill="#b42318">${Math.round(maxS / 1.2)}%</text>
    <path d="${path(Yds, 'ds')}" fill="none" stroke="#1468e5" stroke-width="3"/>
    <path d="${path(Yst, 'stuntingPersen')}" fill="none" stroke="#b42318" stroke-width="3"/>
    ${tren.map((t, i) => `<circle cx="${X(i)}" cy="${Yds(t.ds)}" r="5.5" fill="#1468e5"/><circle cx="${X(i)}" cy="${Yst(t.stuntingPersen)}" r="5.5" fill="#b42318"/>
      ${i % 2 === n % 2 ? '' : `<text x="${X(i)}" y="${H - 8}" font-size="20" text-anchor="middle" fill="#56625e">${NAMA_BULAN[+t.periode.slice(5) - 1].slice(0, 3)}</text>`}`).join('')}
  </svg><div class="baris kecil" style="gap:16px"><span style="color:#1468e5">● Cakupan ditimbang (D/S)</span><span style="color:#b42318">● Stunting (% dari D)</span></div>`;
}

function viewPersetujuan() {
  const v = perluSinyal('Persetujuan');
  v.setelah = async () => {
    const r = await api('persetujuan', {}); const el = $('#isiOnline'); if (!el) return;
    if (!r.ok) return tampilGagal(r);
    const d = r.data;
    el.innerHTML = `<div class="judul-bagian">Balita baru / data belum lengkap (${d.balita.length})</div>
      ${d.balita.length ? `<div class="daftar">${d.balita.map(b => `<div class="item" style="cursor:default;flex-wrap:wrap"><span class="isi"><div class="nama">${esc(b.nama)}</div>
        <div class="sub">${b.jk || '?'} · lahir ${fmtTgl(b.tglLahir)} · Ibu ${esc(b.ibu || '–')} · ${esc(b.posyandu || 'posyandu kosong')} · oleh ${esc(b.oleh)}</div></span>
        <div class="deret-tombol" style="flex:none"><button class="tombol kecil" data-aksi="setujuiB" data-id="${esc(b.id)}" data-s="1" ${b.tglLahir && b.jk && b.posyandu ? '' : 'disabled title="Lengkapi data dulu"'}>Setujui</button>
        <button class="tombol bahaya kecil" data-aksi="setujuiB" data-id="${esc(b.id)}" data-s="0">Tolak</button><button class="tombol garis kecil" data-aksi="ke" data-ke="ubah-balita/${esc(b.id)}">Ubah</button></div></div>`).join('')}</div>` : '<div class="kosong" style="padding:14px">Tidak ada.</div>'}
      ${(d.lansiaKeluar || []).length ? `<div class="judul-bagian">Usulan keluar lansia (${d.lansiaKeluar.length})</div><div class="daftar">${d.lansiaKeluar.map(m => `<div class="item" style="cursor:default;flex-wrap:wrap"><span class="isi"><div class="nama">${esc(m.nama)}</div>
        <div class="sub">${esc(m.alasan)} · ${fmtTgl(m.tanggal)} · ${esc(m.posyandu)} · oleh ${esc(m.oleh)}</div></span>
        <div class="deret-tombol" style="flex:none"><button class="tombol kecil" data-aksi="setujuiKL" data-id="${esc(m.id)}" data-s="1">Setujui</button>
        <button class="tombol bahaya kecil" data-aksi="setujuiKL" data-id="${esc(m.id)}" data-s="0">Tolak</button></div></div>`).join('')}</div>` : ''}
      <div class="judul-bagian">Usulan keluar (${d.mutasi.length})</div>
      ${d.mutasi.length ? `<div class="daftar">${d.mutasi.map(m => `<div class="item" style="cursor:default;flex-wrap:wrap"><span class="isi"><div class="nama">${esc(m.nama)}</div>
        <div class="sub">${esc(m.alasan)} · ${fmtTgl(m.tanggal)} · ${esc(m.posyandu)} · oleh ${esc(m.oleh)}${m.keterangan ? ' · ' + esc(m.keterangan) : ''}</div></span>
        <div class="deret-tombol" style="flex:none"><button class="tombol kecil" data-aksi="setujuiM" data-id="${esc(m.idMutasi)}" data-s="1">Setujui</button>
        <button class="tombol bahaya kecil" data-aksi="setujuiM" data-id="${esc(m.idMutasi)}" data-s="0">Tolak</button></div></div>`).join('')}</div>` : '<div class="kosong" style="padding:14px">Tidak ada.</div>'}
      <p class="redup kecil">Data hasil impor yang belum lengkap (tanggal lahir, jenis kelamin, posyandu) muncul di sini. Lengkapi lewat Ubah, lalu Setujui.</p>`;
  };
  return v;
}

function viewLaporan() {
  const ps = []; for (let i = 0; i < 24; i++) ps.push(geserPeriode(periodeKini(), -i));
  const v = perluSinyal('Laporan Excel', 'menu');
  v.html = `<div class="kartu"><h2>Buat laporan bulanan</h2>
    <label class="isian"><span>Periode</span><select id="perLap">${ps.map((p, i) => `<option value="${p}" ${i === 1 ? 'selected' : ''}>${namaPeriode(p)}</option>`).join('')}</select></label>
    <button class="tombol penuh" data-aksi="buatLaporan">Buat laporan</button>
    <p class="redup kecil">Laporan otomatis juga dibuat robot setiap tanggal 1 dan dikirim ke email admin. Pembuatan bisa memakan waktu sampai 1 menit.</p>
    <div id="hasilLap"></div></div>
    <div class="kartu"><h2>File impor ePPGBM</h2>
    <p class="redup kecil" style="margin-top:0">Data pengukuran dalam format "Format Import Data Pengukuran Balita" ePPGBM. Hanya balita yang sudah ditimbang dan punya NIK 16 angka.</p>
    <div class="grid2">
      <label class="isian"><span>Periode</span><select id="perEp">${ps.map((p, i) => `<option value="${p}" ${i === 0 ? 'selected' : ''}>${namaPeriode(p)}</option>`).join('')}</select></label>
      <label class="isian"><span>Posyandu</span><select id="posEp">${S.d.posyandu.map(p => `<option ${(S.pos || S.d.posyandu[0]) === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}<option value="">Semua (1 file)</option></select></label>
    </div>
    <button class="tombol penuh" data-aksi="unduhEppgbm">${ikon('dokumen', 20)} Unduh file ePPGBM</button>
    <div id="hasilEp"></div></div>
    <div class="judul-bagian">Laporan tersimpan di Google Drive</div>` + v.html;
  v.setelah = async () => {
    const r = await api('daftarLaporan', {}); const el = $('#isiOnline'); if (!el) return;
    if (!r.ok) return tampilGagal(r);
    el.innerHTML = r.data.length ? `<div class="daftar">${r.data.map(f => `<div class="item" style="cursor:default"><span class="isi"><div class="nama">${esc(f.nama)}</div><div class="sub">${esc(f.tanggal)}</div></span>
      <a class="tombol garis kecil" href="${esc(f.unduh)}" target="_blank" rel="noopener">Unduh</a></div>`).join('')}</div>` : '<div class="kosong">Belum ada laporan.</div>';
  };
  return v;
}

function viewPengguna() {
  const v = perluSinyal('Akun kader');
  v.html = `<button class="tombol penuh" data-aksi="formUser" style="margin-bottom:12px">${ikon('tambah', 20)} Tambah akun</button>` + v.html;
  v.setelah = async () => {
    const r = await api('daftarUser', {}); const el = $('#isiOnline'); if (!el) return;
    if (!r.ok) return tampilGagal(r);
    S.users = r.data;
    el.innerHTML = `<div class="daftar">${r.data.map((u, i) => `<button class="item" data-aksi="formUser" data-i="${i}"><span class="isi"><div class="nama">${esc(u.nama)}</div>
      <div class="sub">${esc(u.username)} · ${esc(u.peran)}${u.posyandu ? ' · ' + esc(u.posyandu) : ''}</div></span>
      <span class="lbl ${String(u.aktif).toUpperCase() === 'Y' ? 'Hijau' : 'Abu'}">${String(u.aktif).toUpperCase() === 'Y' ? 'Aktif' : 'Nonaktif'}</span></button>`).join('')}</div>`;
  };
  return v;
}

function formUser(i) {
  const u = i !== undefined && S.users ? S.users[i] : null;
  bukaLembar(`<h3>${u ? 'Ubah akun' : 'Akun baru'}</h3>
    <form id="fUser">
      <label class="isian"><span>Nama</span><input name="nama" value="${u ? esc(u.nama) : ''}" required></label>
      <label class="isian"><span>Username (huruf kecil, tanpa spasi)</span><input name="username" value="${u ? esc(u.username) : ''}" ${u ? 'readonly' : ''} autocapitalize="none" required></label>
      <div class="grid2">
        <label class="isian"><span>Peran</span><select name="peran"><option value="kader">Kader</option><option value="admin" ${u && u.peran === 'admin' ? 'selected' : ''}>Admin</option></select></label>
        <label class="isian"><span>Posyandu</span><select name="posyandu"><option value="">–</option>${S.d.posyandu.map(p => `<option ${u && u.posyandu === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
      </div>
      <div class="grid2">
        <label class="isian"><span>${u ? 'PIN baru (opsional)' : 'PIN (4–8 angka)'}</span><input name="pinBaru" inputmode="numeric" maxlength="8" ${u ? '' : 'required'}></label>
        <label class="isian"><span>Status</span><select name="aktif"><option value="Y">Aktif</option><option value="T" ${u && String(u.aktif).toUpperCase() === 'T' ? 'selected' : ''}>Nonaktif</option></select></label>
      </div>
      <div id="galatU"></div>
      <button class="tombol penuh" type="submit">Simpan</button>
      ${u ? `<button type="button" class="tombol garis penuh" style="margin-top:10px" data-aksi="cabutSesi" data-u="${esc(u.username)}">Keluarkan dari semua HP</button>` : ''}
    </form>`);
}

function viewKunci() {
  const ps = []; for (let i = 0; i < 12; i++) ps.push(geserPeriode(periodeKini(), -i));
  return { judul: 'Kunci periode', nav: 'menu', html: `<div class="pesan-info">Periode terkunci tidak bisa diubah kader. Admin tetap bisa mengubah dan tercatat di Log.</div>
    <div class="daftar">${ps.map(p => { const k = (S.d.kunci || []).indexOf(p) >= 0; return `<div class="item" style="cursor:default"><span class="isi"><div class="nama">${namaPeriode(p)}</div></span>
      <span class="lbl ${k ? 'Merah' : 'Hijau'}">${k ? 'Terkunci' : 'Terbuka'}</span><button class="tombol garis kecil" data-aksi="kunci" data-p="${p}" data-k="${k ? 0 : 1}">${k ? 'Buka' : 'Kunci'}</button></div>`; }).join('')}</div>` };
}

function viewAkun() {
  return { judul: 'Ganti PIN', nav: 'menu', html: `<form id="fPin" class="kartu">
    <label class="isian"><span>PIN lama</span><input name="pinLama" type="password" inputmode="numeric" required></label>
    <label class="isian"><span>PIN baru (4–8 angka)</span><input name="pinBaru" type="password" inputmode="numeric" maxlength="8" required></label>
    <label class="isian"><span>Ulangi PIN baru</span><input name="pinBaru2" type="password" inputmode="numeric" maxlength="8" required></label>
    <div id="galatPin"></div><button class="tombol penuh" type="submit">Simpan PIN</button><p class="redup kecil">Perlu sinyal.</p></form>` };
}

const VIEWS = {
  beranda: viewBeranda, ukur: viewUkur, imunisasi: viewImunisasi, risiko: viewRisiko, menu: viewMenu, balita: viewBalita, antrean: viewAntrean,
  'data-balita': viewDataBalita, 'tambah-balita': () => viewFormBalita(''), 'ubah-balita': viewFormBalita, dashboard: viewDashboard, pantau: viewPantau, belum: viewBelum,
  lansia: viewLansia, 'lansia-profil': viewProfilLansia, 'tambah-lansia': () => viewFormLansia(''), 'ubah-lansia': viewFormLansia,
  persetujuan: viewPersetujuan, laporan: viewLaporan, pengguna: viewPengguna, kunci: viewKunci, akun: viewAkun
};

/* =====================================================================
   AKSI (event delegation)
   ===================================================================== */
const AKSI = {
  salinBelum: async () => {
    const x = S.daftarBelum; if (!x) return;
    const teks = `*Balita belum ditimbang ${namaPeriode(x.p)}* — Posyandu ${x.pos}\n` +
      x.list.map((b, i) => `${i + 1}. ${b.nama} (${rtRw(b)}, ibu ${b.ibu || '-'})`).join('\n');
    try { await navigator.clipboard.writeText(teks); toast('Daftar disalin. Tempel di WhatsApp.'); }
    catch (e) { bukaLembar(`<h3>Salin teks</h3><textarea style="min-height:240px">${esc(teks)}</textarea>`); }
  },
  ke: el => {
    // Dari dalam lembar: ganti entri riwayat lembar, agar Kembali tidak membuka halaman yang sama dua kali
    const dariLembar = lapisan.length && history.state && history.state.lapis;
    tutupLembar(true); lapisan.length = 0;
    if (dariLembar) location.replace('#/' + el.dataset.ke); else location.hash = '#/' + el.dataset.ke;
  },
  // Dibuka langsung di halaman turunan (tanpa riwayat di aplikasi): kembali ke Beranda, bukan keluar
  kembali: () => { if (navDalam) history.back(); else location.hash = '#/beranda'; },
  tutup: () => tutupLembar(),
  tutupRender: () => { tutupLembar(); render(); },
  sinkron: async () => { await kirimAntrean(); await sinkron(false); },
  periode: el => { S.periode = el.dataset.p; render(); },
  filterUkur: el => { S.filterUkur = el.dataset.f; render(); },
  filterBalita: el => { S.filterBalita = el.dataset.f; render(); },
  tabImun: el => { S.tabImun = el.dataset.t; render(); },
  grafik: el => { S.grafik = el.dataset.g; render(); },
  semuaVaksin: () => { S.semuaVaksin = !S.semuaVaksin; render(); },
  keVitA: () => { S.tabImun = 'Vitamin A'; location.hash = '#/imunisasi'; },
  formUkur: el => formUkur(el.dataset.id, S.periode || periodeKini()),
  formUkurP: el => formUkur(el.dataset.id, el.dataset.p),
  formImun: el => formImun(el.dataset.id, el.dataset.k),
  formVit: el => formVit(el.dataset.id),
  formTL: el => formTL(el.dataset.id),
  formKPSP: el => formKPSP(el.dataset.id),
  periodeL: el => { S.periodeL = el.dataset.p; render(); },
  filterL: el => { S.filterL = el.dataset.f; render(); },
  formPeriksaL: el => formPeriksaL(el.dataset.id, S.periodeL || periodeKini()),
  formPeriksaLP: el => formPeriksaL(el.dataset.id, el.dataset.p),
  keluarL: el => formKeluarL(el.dataset.id),
  hapusPeriksaL: async () => {
    const f = $('#fPeriksaL'), l = S.d.lansiaById[f.dataset.id];
    if (!await konfirmasi('Hapus pemeriksaan?', 'Data ' + esc(l.nama) + ' ' + namaPeriode(f.dataset.periode) + ' akan dihapus.', 'Hapus', true)) return;
    await antrekan('hapusPeriksaLansia', { id: f.dataset.id, periode: f.dataset.periode }, 'Hapus periksa ' + l.nama);
    tutupLembar(); render(); toast('Pemeriksaan dihapus.');
  },
  setujuiKL: async el => {
    el.disabled = true;
    const r = await api('prosesKeluarLansia', { id: el.dataset.id, setuju: el.dataset.s === '1' });
    if (!r.ok) { toast(r.pesan); el.disabled = false; return; }
    toast(el.dataset.s === '1' ? 'Lansia dikeluarkan.' : 'Usulan ditolak.'); render(); sinkron(true);
  },
  formPD3I: el => formPD3I(el.dataset.id, el.dataset.lapor),
  mutasi: el => formMutasi(el.dataset.id),
  formUser: el => formUser(el.dataset.i !== undefined ? +el.dataset.i : undefined),
  hapusUkur: async () => {
    const f = $('#fUkur'), b = S.d.byId[f.dataset.id];
    if (!await konfirmasi('Hapus pengukuran?', 'Data ' + esc(b.nama) + ' ' + namaPeriode(f.dataset.periode) + ' akan dihapus.', 'Hapus', true)) return;
    await antrekan('hapusPengukuran', { id: f.dataset.id, periode: f.dataset.periode }, 'Hapus ukur ' + b.nama + ' (' + namaPeriode(f.dataset.periode) + ')');
    tutupLembar(); render(); toast('Pengukuran dihapus.');
  },
  hapusImun: async () => {
    const f = $('#fImun'), j = S.d.jadwal.find(x => x.kode === f.dataset.k);
    if (!await konfirmasi('Hapus imunisasi?', 'Catatan ' + esc(j ? j.nama : f.dataset.k) + ' untuk ' + esc(S.d.byId[f.dataset.id].nama) + ' akan dihapus.', 'Hapus', true)) return;
    await antrekan('hapusImunisasi', { id: f.dataset.id, kode: f.dataset.k }, 'Hapus imunisasi ' + f.dataset.k);
    tutupLembar(); render();
  },
  hapusVit: async el => {
    if (!await konfirmasi('Hapus catatan?', 'Catatan vitamin/obat cacing ini akan dihapus.', 'Hapus', true)) return;
    await antrekan('hapusVitamin', { id: el.dataset.id, idVit: el.dataset.v }, 'Hapus vitamin');
    render();
  },
  aktifkan: async el => {
    if (!await konfirmasi('Aktifkan lagi?', 'Balita akan kembali masuk daftar sasaran.', 'Aktifkan')) return;
    await antrekan('usulMutasi', { id: el.dataset.id, jenis: 'Masuk', alasan: 'Kembali aktif', tanggal: hariIni() }, 'Aktifkan ' + S.d.byId[el.dataset.id].nama);
    render();
  },
  pasang: async () => { if (!S.pasang) return; S.pasang.prompt(); await S.pasang.userChoice; S.pasang = null; render(); },
  perbaruiApp: () => { if (S.swBaru) S.swBaru.postMessage('perbarui'); },
  keluar: () => keluar(),
  kirimSekarang: async () => { S.antrean.forEach(o => { if (o.status === 'gagal') { o.status = 'menunggu'; DB.simpanAntrean(o); } }); await kirimAntrean(); render(); if (!S.antrean.length) toast('Semua data terkirim.'); },
  ulangi: async el => { const it = S.antrean.find(o => o.qid === el.dataset.q); if (it) { it.status = 'menunggu'; it.pesan = ''; await DB.simpanAntrean(it); susunData(); await kirimAntrean(); render(); } },
  buang: async el => {
    if (!await konfirmasi('Buang data ini?', 'Data ini tidak akan dikirim. Tampilan kembali ke data server.', 'Buang', true)) return;
    S.antrean = S.antrean.filter(o => o.qid !== el.dataset.q); await DB.hapusAntrean(el.dataset.q); susunData(); render();
  },
  salinWA: async () => {
    const v = viewImunisasi(), P = periodeKini();
    const teks = `*${S.tabImun === 'KPSP' ? 'Jadwal KPSP (perkembangan)' : S.tabImun === 'Vitamin A' ? 'Sasaran Vitamin A ' + namaPeriode(periodeVitA(P)) : 'Imunisasi ' + S.tabImun.toLowerCase()}* — ${admin() && !S.pos ? S.d.desa : 'Posyandu ' + (S.pos || S.d.user.posyandu)}\n` +
      v.data.map((x, i) => `${i + 1}. ${x.b.nama} (${rtRw(x.b)}, ibu ${x.b.ibu || '-'}) — ${x.ket}`).join('\n');
    try { await navigator.clipboard.writeText(teks); toast('Daftar disalin. Tempel di WhatsApp.'); }
    catch (e) { bukaLembar(`<h3>Salin teks</h3><textarea style="min-height:240px">${esc(teks)}</textarea>`); }
  },
  muatUlang: () => render(),
  cekPembaruan: async () => {
    if (!S.swReg) { toast('Pembaruan otomatis belum aktif di perangkat ini. Tutup lalu buka lagi aplikasinya.'); return; }
    if (!navigator.onLine) { toast('Perlu sinyal untuk memeriksa versi baru.'); return; }
    toast('Memeriksa versi baru…', 2500);
    try { await S.swReg.update(); } catch (e) { toast('Gagal memeriksa. Coba lagi saat sinyal bagus.'); return; }
    if (S.swBaru || S.swReg.waiting) { S.swBaru = S.swBaru || S.swReg.waiting; if (!cobaPerbarui()) toast('Versi baru siap. Tutup formulir dulu, lalu coba lagi.'); }
    else if (S.swReg.installing) toast('Mengunduh versi baru… aplikasi akan dimuat ulang sendiri.', 4500);
    else toast('Aplikasi sudah versi terbaru (' + C.VERSI + ').');
  },
  buatLaporan: async el => {
    const p = $('#perLap').value, h = $('#hasilLap');
    el.disabled = true; el.innerHTML = '<span class="spinner"></span> Membuat laporan…';
    const r = await api('buatLaporan', { periode: p }, { batas: 300000 });
    el.disabled = false; el.textContent = 'Buat laporan';
    h.innerHTML = r.ok ? `<div class="pesan-info" style="margin-top:12px">Laporan ${esc(r.data.nama)} siap.</div><div class="deret-tombol">
      <a class="tombol" href="${esc(r.data.unduh)}" target="_blank" rel="noopener">Unduh Excel</a><a class="tombol garis" href="${esc(r.data.url)}" target="_blank" rel="noopener">Buka di Drive</a></div>`
      : `<div class="pesan-galat" style="margin-top:12px">${esc(r.pesan)}</div>`;
  },
  unduhEppgbm: async el => {
    const p = $('#perEp').value, pos = $('#posEp').value, h = $('#hasilEp'), teks = el.innerHTML;
    el.disabled = true; el.innerHTML = '<span class="spinner"></span> Menyiapkan file…';
    const r = await api('eppgbm', { periode: p, posyandu: pos }, { batas: 120000 });
    el.disabled = false; el.innerHTML = teks;
    if (!r.ok) { h.innerHTML = `<div class="pesan-galat" style="margin-top:12px">${esc(r.pesan)}</div>`; return; }
    const d = r.data;
    if (d.jumlah) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([d.isi], { type: 'application/vnd.ms-excel' }));
      a.download = d.nama; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }
    h.innerHTML = `<div class="${d.jumlah ? 'pesan-info' : 'pesan-awas'}" style="margin-top:12px">${d.jumlah ? `<b>${esc(d.nama)}</b> terunduh: ${d.jumlah} balita.` : 'Belum ada balita ber-NIK yang ditimbang pada periode ini.'}</div>
      ${d.tanpaNik.length ? `<div class="pesan-awas">${d.tanpaNik.length} balita sudah ditimbang tetapi NIK kosong/tidak 16 angka, jadi tidak masuk file. Lengkapi NIK lewat Data balita:<br>${d.tanpaNik.slice(0, 30).map(x => esc(x.nama) + (pos ? '' : ' (' + esc(x.posyandu) + ')')).join(', ')}${d.tanpaNik.length > 30 ? ', …' : ''}</div>` : ''}
      ${d.jumlah ? '<p class="redup kecil">Di ePPGBM: menu Import → format pengukuran → pilih file ini. Bila ditolak, buka dulu di Excel lalu Simpan sebagai "Excel 97-2003 Workbook (.xls)".</p>' : ''}`;
  },
  setujuiB: async el => {
    el.disabled = true;
    const r = await api('setujuiBalita', { id: el.dataset.id, setuju: el.dataset.s === '1' });
    if (!r.ok) { toast(r.pesan); el.disabled = false; return; }
    toast(el.dataset.s === '1' ? 'Disetujui.' : 'Ditolak.'); render(); sinkron(true);
  },
  setujuiM: async el => {
    el.disabled = true;
    const r = await api('prosesMutasi', { idMutasi: el.dataset.id, setuju: el.dataset.s === '1' });
    if (!r.ok) { toast(r.pesan); el.disabled = false; return; }
    toast(el.dataset.s === '1' ? 'Mutasi disetujui.' : 'Usulan ditolak.'); render(); sinkron(true);
  },
  kunci: async el => {
    el.disabled = true;
    const r = await api('kunciPeriode', { periode: el.dataset.p, kunci: el.dataset.k === '1' });
    if (!r.ok) { toast(r.pesan); el.disabled = false; return; }
    const k = S.dasar.kunci.filter(p => p !== el.dataset.p); if (el.dataset.k === '1') k.push(el.dataset.p);
    S.dasar.kunci = k; await simpanDasar(); susunData(); render();
  },
  cabutSesi: async el => {
    const r = await api('cabutSesi', { username: el.dataset.u });
    toast(r.ok ? 'Akun dikeluarkan dari semua HP.' : r.pesan);
  }
};

/* Kirim formulir */
const KIRIM = {
  fLogin: f => kirimLogin(f),
  fUkur: f => simpanUkur(f),
  fBalita: f => simpanBalitaForm(f),
  fImun: async f => {
    const b = S.d.byId[f.dataset.id];
    if (f.tgl.value < b.tglLahir || f.tgl.value > hariIni()) { toast('Tanggal tidak valid.'); return; }
    await antrekan('simpanImunisasi', { id: f.dataset.id, kode: f.dataset.k, tgl: f.tgl.value, tempat: f.tempat.value }, 'Imunisasi ' + f.dataset.k + ' ' + b.nama);
    tutupLembar(); render(); toast('Imunisasi tercatat.');
  },
  fVit: async f => {
    const b = S.d.byId[f.dataset.id];
    if (!f.tgl.value || f.tgl.value < b.tglLahir || f.tgl.value > hariIni()) { toast('Tanggal tidak valid.'); return; }
    const usia = usiaBulan(b.tglLahir, f.tgl.value), j = f.jenis.value;
    const cocok = j === 'Obat_Cacing' ? usia >= 12 : j === jenisVitA(usia);
    const anjuran = { VitA_Biru: 'kapsul biru untuk 6–11 bulan', VitA_Merah: 'kapsul merah untuk 12–59 bulan', Obat_Cacing: 'obat cacing mulai usia 12 bulan' }[j];
    if (!cocok && !await konfirmasi('Periksa jenis dan usia', `Anak berusia ${usiaTeks(usia)} pada tanggal pemberian, sedangkan anjurannya ${anjuran}. Tetap simpan?`, 'Tetap simpan')) return;
    await antrekan('simpanVitamin', { id: f.dataset.id, jenis: f.jenis.value, tgl: f.tgl.value }, 'Vitamin/obat cacing ' + b.nama);
    tutupLembar(); render(); toast('Tercatat.');
  },
  fPeriksaL: f => simpanPeriksaL(f),
  fLansia: f => simpanLansiaForm(f),
  fKeluarL: async f => {
    const l = S.d.lansiaById[f.dataset.id];
    if (!f.alasan.value) { toast('Pilih alasan.'); return; }
    await antrekan('usulKeluarLansia', { id: l.id, alasan: f.alasan.value, tanggal: f.tanggal.value, keterangan: rapiSpasi(f.keterangan.value) }, 'Keluar lansia: ' + l.nama);
    tutupLembar(); toast(admin() ? 'Lansia dikeluarkan dari daftar.' : 'Usulan terkirim ke admin.'); render();
  },
  fKPSP: async f => {
    const b = S.d.byId[f.dataset.id];
    if (f.jumlahYa.value === '') { $('#galatKPSP').innerHTML = '<div class="pesan-galat">Pilih jumlah jawaban "Ya".</div>'; return; }
    if (!f.tgl.value || f.tgl.value < b.tglLahir || f.tgl.value > hariIni()) { $('#galatKPSP').innerHTML = '<div class="pesan-galat">Tanggal tidak valid.</div>'; return; }
    const x = { id: b.id, tgl: f.tgl.value, usiaKpsp: +f.usiaKpsp.value, jumlahYa: +f.jumlahYa.value, tdd: f.tdd.value, tdl: f.tdl.value, catatan: rapiSpasi(f.catatan.value) };
    await antrekan('simpanKPSP', x, 'KPSP ' + x.usiaKpsp + ' bln ' + b.nama);
    tutupLembar(); render();
    toast('KPSP tercatat: ' + hasilKPSP(x.jumlahYa) + '.' + (hasilKPSP(x.jumlahYa) === 'Sesuai' ? '' : ' ' + SARAN_KPSP[hasilKPSP(x.jumlahYa)]), 6000);
  },
  fPD3I: async f => {
    const b = S.d.byId[f.dataset.id];
    if (!f.penyakit.value) { $('#galatPD3I').innerHTML = '<div class="pesan-galat">Pilih jenis penyakit.</div>'; return; }
    if (!f.tglGejala.value || f.tglGejala.value < b.tglLahir || f.tglGejala.value > hariIni()) { $('#galatPD3I').innerHTML = '<div class="pesan-galat">Tanggal mulai gejala tidak valid.</div>'; return; }
    const baru = !f.dataset.lapor;
    if (baru && !await konfirmasi('Kirim laporan suspek?', 'Laporan akan diteruskan ke admin desa. Pastikan anak segera diperiksa bidan desa atau Puskesmas.', 'Kirim laporan')) return;
    const x = { idLapor: f.dataset.lapor || idBaru('PD3I-'), id: b.id, penyakit: f.penyakit.value, tglGejala: f.tglGejala.value, gejala: rapiSpasi(f.gejala.value),
      status: f.status ? f.status.value : 'Dilaporkan', tindakLanjut: f.tindakLanjut ? rapiSpasi(f.tindakLanjut.value) : '' };
    await antrekan('laporPD3I', x, (baru ? 'Lapor PD3I ' : 'Ubah PD3I ') + b.nama);
    tutupLembar(); render(); toast(baru ? 'Laporan suspek PD3I tersimpan dan dikirim ke admin.' : 'Laporan diperbarui.', 5000);
  },
  fTL: async f => {
    const b = S.d.byId[f.dataset.id];
    const iv = Array.from(f.querySelectorAll('input[name=iv]:checked')).map(i => i.value).join(', ');
    // Tanggal rujuk hanya bermakna bila tujuan rujukan dipilih
    await antrekan('simpanTindakLanjut', { id: f.dataset.id, idTL: f.dataset.tl, status: f.status.value, tglRujuk: f.dirujukKe.value ? f.tglRujuk.value : '', dirujukKe: f.dirujukKe.value,
      intervensi: iv, hasil: rapiSpasi(f.hasil.value), label: f.dataset.label, alasan: f.dataset.alasan }, 'Tindak lanjut ' + b.nama);
    tutupLembar(); render(); toast('Tindak lanjut tercatat.');
  },
  fMutasi: async f => {
    const b = S.d.byId[f.dataset.id];
    if (!f.alasan.value) { toast('Pilih alasan.'); return; }
    await antrekan('usulMutasi', { id: f.dataset.id, jenis: 'Keluar', alasan: f.alasan.value, tanggal: f.tanggal.value, keterangan: rapiSpasi(f.keterangan.value) }, 'Keluar: ' + b.nama);
    tutupLembar(); toast(admin() ? 'Balita dikeluarkan dari daftar.' : 'Usulan terkirim ke admin.'); render();
  },
  fUser: async f => {
    const pin = f.pinBaru.value.trim();
    if (pin && !/^\d{4,8}$/.test(pin)) { $('#galatU').innerHTML = '<div class="pesan-galat">PIN harus 4 sampai 8 angka.</div>'; return; }
    const r = await api('simpanUser', { nama: rapiSpasi(f.nama.value), username: f.username.value.trim().toLowerCase(), peran: f.peran.value, posyandu: f.posyandu.value,
      pinBaru: pin, aktif: f.aktif.value });
    if (!r.ok) { $('#galatU').innerHTML = `<div class="pesan-galat">${esc(r.pesan)}</div>`; return; }
    tutupLembar(); toast('Akun tersimpan.'); render();
  },
  fPin: async f => {
    if (!/^\d{4,8}$/.test(f.pinBaru.value)) { $('#galatPin').innerHTML = '<div class="pesan-galat">PIN baru harus 4 sampai 8 angka.</div>'; return; }
    if (f.pinBaru.value !== f.pinBaru2.value) { $('#galatPin').innerHTML = '<div class="pesan-galat">PIN baru tidak sama.</div>'; return; }
    const r = await api('gantiPin', { pinLama: f.pinLama.value, pinBaru: f.pinBaru.value });
    if (!r.ok) { $('#galatPin').innerHTML = `<div class="pesan-galat">${esc(r.pesan)}</div>`; return; }
    toast('PIN berhasil diganti.'); location.hash = '#/menu';
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-aksi]');
  if (!el || el.disabled) return;
  const fn = AKSI[el.dataset.aksi];
  if (fn) { e.preventDefault(); fn(el); }
});
/* Kirim formulir: cegah ketukan ganda (mis. balita tercatat dua kali) dan tunjukkan sedang menyimpan */
document.addEventListener('submit', async e => {
  const f = e.target, fn = KIRIM[f.id];
  if (!fn) return;
  e.preventDefault();
  if (f.dataset.sibuk) return;
  f.dataset.sibuk = '1';
  const t = f.querySelector('[type=submit]'), teks = t ? t.innerHTML : '';
  const sibuk = f.id === 'fLogin' || !t ? null : setTimeout(() => { t.innerHTML = '<span class="spinner"></span> Menyimpan…'; }, 300);
  if (t) t.disabled = true;
  try { await fn(f); } finally {
    clearTimeout(sibuk);
    delete f.dataset.sibuk;
    if (t && t.isConnected) { t.disabled = false; if (sibuk) t.innerHTML = teks; }
  }
});
document.addEventListener('change', async e => {
  const k = e.target.dataset && e.target.dataset.ubah;
  if (!k) return;
  S[k] = e.target.value;
  if (k === 'pos') await DB.set('pos', S.pos);
  render();
});

/* =====================================================================
   MULAI
   ===================================================================== */
/* Posisi gulir tiap halaman diingat: tombol Kembali mengembalikan kader ke tempat semula di daftar */
const gulirHal = {};
let navDalam = false;
window.addEventListener('hashchange', e => {
  navDalam = true;
  gulirHal[new URL(e.oldURL).hash] = window.scrollY;
  tutupLembar(true); lapisan.length = 0;
  render(gulirHal[location.hash] || 0);
});
/* Papan ketik terbuka → sembunyikan navigasi bawah (CSS body.ketik) agar tidak naik menutupi isian */
function cekKetik() {
  const a = document.activeElement, vv = window.visualViewport;
  const fokus = a && a.matches && a.matches('textarea, input:not([type=checkbox]):not([type=radio]):not([type=date]):not([type=button]):not([type=submit])');
  document.body.classList.toggle('ketik', !!fokus && (!vv || vv.height < screen.height * 0.75));
}
document.addEventListener('focusin', cekKetik);
document.addEventListener('focusout', () => setTimeout(cekKetik, 0));
if (window.visualViewport) window.visualViewport.addEventListener('resize', cekKetik);
window.addEventListener('online', () => { S.online = true; perbaruiStatus(); kirimAntrean(); });
window.addEventListener('offline', () => { S.online = false; perbaruiStatus(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  kirimAntrean();
  if (S.swReg) S.swReg.update().catch(() => {}); // aplikasi lama terbuka di latar: periksa versi baru saat dibuka lagi
});
setInterval(() => { if (S.antrean.some(o => o.status === 'menunggu')) kirimAntrean(); }, 30000);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.pasang = e; segarkan(); });

/* Pembaruan aplikasi: versi baru dipasang otomatis saat aman, yaitu tidak ada lembar/dialog terbuka,
   tidak sedang mengetik atau mengisi formulir halaman, dan tidak sedang mengirim. Paling lambat saat pindah halaman.
   Antrean data tetap aman di IndexedDB. */
function cobaPerbarui() {
  const a = document.activeElement, hal = rute().hal;
  if (!S.swBaru || S.kirim || document.querySelector('.tirai') || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) ||
    ['tambah-balita', 'ubah-balita', 'akun'].indexOf(hal) >= 0) return false;
  try { sessionStorage.setItem('diperbarui', '1'); } catch (e) { }
  S.swBaru.postMessage('perbarui');
  return true;
}
window.addEventListener('hashchange', () => setTimeout(cobaPerbarui, 0));

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    S.swReg = reg;
    const tandai = w => { if (w && navigator.serviceWorker.controller) { S.swBaru = w; if (!cobaPerbarui()) segarkan(); } };
    if (reg.waiting) tandai(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => { if (w.state === 'installed') tandai(w); });
    });
  }).catch(() => {});
  let muatUlang = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!muatUlang) { muatUlang = true; location.reload(); } });
}

(async function mulai() {
  try {
    S.sesi = await DB.get('sesi') || null;
    if (S.sesi && S.sesi.kedaluwarsa && S.sesi.kedaluwarsa < Date.now()) { S.sesi = null; S.galatLogin = 'Sesi 30 hari sudah habis, silakan login lagi.'; }
    S.dasar = await DB.get('dasar') || null;
    S.antrean = await DB.antrean() || [];
    S.antrean.forEach(o => { if (o.status === 'kirim') o.status = 'menunggu'; });
    S.pos = await DB.get('pos') || '';
  } catch (e) { console.error(e); }
  susunData();
  if (!S.sesi && location.hash !== '#/login') location.hash = '#/login';
  render();
  try { if (sessionStorage.getItem('diperbarui')) { sessionStorage.removeItem('diperbarui'); toast('Aplikasi diperbarui ke versi ' + C.VERSI + '.'); } } catch (e) { }
  if (S.sesi) {
    await kirimAntrean();
    const lama = !S.dasar || Date.now() - (S.dasar.waktuSinkron || 0) > 10 * 60000;
    if (lama) await sinkron(!!S.dasar);
  }
})();
