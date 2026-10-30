/* =====================================================================
   GIZI — logika bersama server (Apps Script) dan aplikasi (PWA).
   Berkas ini SAMA PERSIS dengan pwa/gizi.js. Jika mengubah salah satu,
   salin ke yang lain agar hasil di HP dan di server tetap sama.
   Acuan: Permenkes No. 2 Tahun 2020 tentang Standar Antropometri Anak
   (tabel WHO 2006, metode LMS).
   ===================================================================== */

var GIZI_VERSI = '1.0';

/* Kenaikan Berat Minimal (gram) menurut usia bulan. Usia >= 12 bln: 200 g.
   Bisa diganti dari sheet Master_KBM. */
var KBM_DEFAULT = { 1: 800, 2: 900, 3: 800, 4: 600, 5: 500, 6: 400, 7: 400, 8: 300, 9: 300, 10: 300, 11: 200 };

/* ---------- Tanggal dan periode ---------- */
function tglKeMs(t) {
  if (t instanceof Date) return Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  var s = String(t || '').slice(0, 10).split('-');
  if (s.length < 3) return NaN;
  return Date.UTC(+s[0], +s[1] - 1, +s[2]);
}
function tglIso(ms) { return new Date(ms).toISOString().slice(0, 10); }
function usiaHari(lahir, ukur) { return Math.round((tglKeMs(ukur) - tglKeMs(lahir)) / 864e5); }
/* Usia bulan penuh menurut kalender (lahir 1 Jan, diukur 1 Jan tahun berikutnya = 12 bulan) */
function usiaBulan(lahir, ukur) {
  var a = tglIso(tglKeMs(lahir)), b = tglIso(tglKeMs(ukur));
  var m = (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
  if (+b.slice(8, 10) < +a.slice(8, 10)) m--;
  return m;
}
function periodeDari(t) { return tglIso(tglKeMs(t)).slice(0, 7); }
function geserPeriode(p, n) {
  var y = +p.slice(0, 4), m = +p.slice(5, 7) - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + '-' + (m < 9 ? '0' : '') + (m + 1);
}
function awalPeriode(p) { return p + '-01'; }
function akhirPeriode(p) { return tglIso(tglKeMs(geserPeriode(p, 1) + '-01') - 864e5); }
var NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function namaPeriode(p) { return NAMA_BULAN[+p.slice(5, 7) - 1] + ' ' + p.slice(0, 4); }

/* ---------- z-score metode LMS ---------- */
function _lms(tabel, idx) {
  if (!tabel || idx < 0 || idx > tabel.length - 1) return null;
  var i = Math.floor(idx), f = idx - i;
  if (f < 1e-9 || i === tabel.length - 1) return tabel[i];
  var a = tabel[i], b = tabel[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
function _nilaiSD(L, M, S, z) { return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L); }
function _z(x, lms, koreksiBerat) {
  if (!lms || !(x > 0)) return null;
  var L = lms[0], M = lms[1], S = lms[2];
  var z = L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
  if (koreksiBerat && z > 3) {
    var sd3 = _nilaiSD(L, M, S, 3), sd2 = _nilaiSD(L, M, S, 2);
    z = 3 + (x - sd3) / (sd3 - sd2);
  } else if (koreksiBerat && z < -3) {
    var sd3n = _nilaiSD(L, M, S, -3), sd2n = _nilaiSD(L, M, S, -2);
    z = -3 + (x - sd3n) / (sd2n - sd3n);
  }
  return Math.round(z * 100) / 100;
}

/* Hitung semua indikator untuk satu pengukuran.
   p = {jk:'L'|'P', tglLahir, tglUkur, bb, tb, cara:'Berbaring'|'Berdiri', lila, lk} */
function hitungGizi(p) {
  var T = WHO[p.jk === 'P' ? 'P' : 'L'];
  var hari = usiaHari(p.tglLahir, p.tglUkur);
  var bln = hari / 30.4375;
  var r = { usiaHari: hari, usiaBln: usiaBulan(p.tglLahir, p.tglUkur), tbKoreksi: null,
            zBBU: null, zTBU: null, zBBTB: null, zLKU: null,
            stBBU: '', stTBU: '', stBBTB: '', stLKU: '', stLILA: '' };
  if (!(hari >= 0) || bln > 61) return r;
  var bb = +p.bb || 0, tb = +p.tb || 0, lk = +p.lk || 0, lila = +p.lila || 0;
  if (tb > 0) {
    if (r.usiaBln < 24 && p.cara === 'Berdiri') tb += 0.7;
    if (r.usiaBln >= 24 && p.cara === 'Berbaring') tb -= 0.7;
    r.tbKoreksi = Math.round(tb * 10) / 10;
  }
  r.zBBU = _z(bb, _lms(T.bbu, bln), true);
  r.zTBU = _z(tb, r.usiaBln < 24 ? _lms(T.pbu, Math.min(bln, 24)) : _lms(T.tbu, Math.max(bln - 24, 0)), false);
  if (bb && tb) r.zBBTB = r.usiaBln < 24 ? _z(bb, _lms(T.bbpb, (tb - 45) / 0.5), true) : _z(bb, _lms(T.bbtb, (tb - 65) / 0.5), true);
  r.zLKU = _z(lk, _lms(T.lku, bln), false);
  r.stBBU = statusBBU(r.zBBU); r.stTBU = statusTBU(r.zTBU); r.stBBTB = statusBBTB(r.zBBTB);
  r.stLKU = statusLKU(r.zLKU); r.stLILA = statusLILA(lila, r.usiaBln);
  return r;
}

function statusBBU(z) { return z === null ? '' : z < -3 ? 'BB sangat kurang' : z < -2 ? 'BB kurang' : z <= 1 ? 'Normal' : 'Risiko BB lebih'; }
function statusTBU(z) { return z === null ? '' : z < -3 ? 'Sangat pendek' : z < -2 ? 'Pendek' : z <= 3 ? 'Normal' : 'Tinggi'; }
function statusBBTB(z) { return z === null ? '' : z < -3 ? 'Gizi buruk' : z < -2 ? 'Gizi kurang' : z <= 1 ? 'Gizi baik' : z <= 2 ? 'Berisiko gizi lebih' : z <= 3 ? 'Gizi lebih' : 'Obesitas'; }
function statusLKU(z) { return z === null ? '' : z < -2 ? 'Mikrosefali' : z > 2 ? 'Makrosefali' : 'Normal'; }
function statusLILA(lila, bln) { return !lila || bln < 6 ? '' : lila < 11.5 ? 'Gizi buruk' : lila < 12.5 ? 'Gizi kurang' : 'Normal'; }

/* ---------- Naik berat badan: N / T / O / B ----------
   riwayat = pengukuran anak sebelum periode ini: [{periode, bb, nt, zTBU}] */
function hitungNT(bb, usiaBln, periode, riwayat, kbm) {
  kbm = kbm || KBM_DEFAULT;
  var lalu = null, adaSebelum = false, pLalu = geserPeriode(periode, -1);
  for (var i = 0; i < riwayat.length; i++) {
    if (riwayat[i].periode < periode) adaSebelum = true;
    if (riwayat[i].periode === pLalu) lalu = riwayat[i];
  }
  if (!lalu || !(+lalu.bb > 0)) return { nt: adaSebelum ? 'O' : 'B', duaT: false, selisihG: null };
  var selisih = Math.round((+bb - +lalu.bb) * 1000);
  var min = usiaBln >= 12 ? (kbm[12] || 200) : (kbm[usiaBln] || 800);
  var nt = selisih >= min ? 'N' : 'T';
  return { nt: nt, duaT: nt === 'T' && lalu.nt === 'T', selisihG: selisih };
}

/* ---------- Label risiko: Merah / Kuning / Hijau ---------- */
function hitungLabel(g, nt, periode, riwayat) {
  var merah = [], kuning = [];
  if (g.zTBU !== null && g.zTBU < -2) merah.push('TB/U ' + g.stTBU.toLowerCase() + ' (stunting)');
  if (g.zBBTB !== null && g.zBBTB < -2) merah.push('BB/TB ' + g.stBBTB.toLowerCase());
  if (g.zBBU !== null && g.zBBU < -3) merah.push('BB/U sangat kurang');
  if (g.stLKU && g.stLKU !== 'Normal') merah.push('Lingkar kepala ' + g.stLKU.toLowerCase());
  if (g.stLILA && g.stLILA !== 'Normal') merah.push('LiLA ' + g.stLILA.toLowerCase());
  if (nt.duaT) merah.push('BB tidak naik 2 bulan (2T)');

  if (g.zBBU !== null && g.zBBU >= -3 && g.zBBU < -2) kuning.push('BB/U kurang');
  if (nt.nt === 'T' && !nt.duaT) kuning.push('BB tidak naik (T)');
  var lalu = null, tigaLalu = null;
  for (var i = 0; i < riwayat.length; i++) {
    var r = riwayat[i];
    if (r.periode >= periode || r.zTBU === null || r.zTBU === '' || r.zTBU === undefined) continue;
    if (!lalu || r.periode > lalu.periode) lalu = r;
    if (r.periode <= geserPeriode(periode, -3) && r.periode >= geserPeriode(periode, -4) && (!tigaLalu || r.periode > tigaLalu.periode)) tigaLalu = r;
  }
  if (g.zTBU !== null && g.zTBU >= -2 && g.zTBU <= -1 && lalu && g.zTBU < +lalu.zTBU) kuning.push('TB/U mendekati pendek dan turun');
  if (g.zTBU !== null && tigaLalu && +tigaLalu.zTBU - g.zTBU >= 0.5) kuning.push('TB/U turun ' + (Math.round((+tigaLalu.zTBU - g.zTBU) * 10) / 10) + ' SD dalam 3 bulan');
  var ada1 = false, ada2 = false, adaLama = false;
  for (var j = 0; j < riwayat.length; j++) {
    if (riwayat[j].periode === geserPeriode(periode, -1)) ada1 = true;
    if (riwayat[j].periode === geserPeriode(periode, -2)) ada2 = true;
    if (riwayat[j].periode < geserPeriode(periode, -2)) adaLama = true;
  }
  if (!ada1 && !ada2 && adaLama) kuning.push('Tidak ditimbang 2 bulan sebelumnya');

  if (merah.length) return { label: 'Merah', alasan: merah.concat(kuning) };
  if (kuning.length) return { label: 'Kuning', alasan: kuning };
  return { label: 'Hijau', alasan: [] };
}

/* ---------- Skor risiko (mengurutkan prioritas di dalam label) ----------
   f = {bbLahir, pbLahir, prematur, imunTerlambat, vitATidak, nt, zTBU} */
function skorRisiko(f) {
  var s = 0;
  if (+f.bbLahir > 0 && +f.bbLahir < 2500) s += 2;
  if (+f.pbLahir > 0 && +f.pbLahir < 48) s += 2;
  if (f.prematur === 'Y') s += 1;
  if (f.imunTerlambat) s += 1;
  if (f.vitATidak) s += 1;
  if (f.nt === 'T') s += 1;
  if (f.zTBU !== null && f.zTBU !== '' && f.zTBU !== undefined && +f.zTBU >= -2 && +f.zTBU <= -1) s += 2;
  return s;
}

/* ---------- Validasi input ---------- */
function validasiUkur(d, tglLahir) {
  if (!d.tglUkur || isNaN(tglKeMs(d.tglUkur))) return 'Tanggal ukur wajib diisi.';
  if (periodeDari(d.tglUkur) !== d.periode) return 'Tanggal ukur harus di dalam periode ' + namaPeriode(d.periode) + '.';
  if (tglLahir && tglKeMs(d.tglUkur) < tglKeMs(tglLahir)) return 'Tanggal ukur sebelum tanggal lahir.';
  if (!(+d.bb > 0) && !(+d.tb > 0) && !(+d.lila > 0) && !(+d.lk > 0)) return 'Isi minimal satu hasil ukur.';
  if (+d.bb && (+d.bb < 1.5 || +d.bb > 30)) return 'Berat badan harus 1,5 sampai 30 kg.';
  if (+d.tb && (+d.tb < 40 || +d.tb > 125)) return 'Tinggi/panjang badan harus 40 sampai 125 cm.';
  if (+d.lila && (+d.lila < 8 || +d.lila > 22)) return 'LiLA harus 8 sampai 22 cm.';
  if (+d.lk && (+d.lk < 30 || +d.lk > 56)) return 'Lingkar kepala harus 30 sampai 56 cm.';
  return '';
}
/* Peringatan (boleh tetap disimpan). lalu = pengukuran bulan sebelumnya */
function peringatanUkur(d, lalu) {
  var w = [];
  if (!lalu) return w;
  if (+d.bb && +lalu.bb) {
    if (+lalu.bb - +d.bb > 1) w.push('BB turun lebih dari 1 kg dari bulan lalu (' + String(lalu.bb).replace('.', ',') + ' kg).');
    if (+d.bb - +lalu.bb > 2) w.push('BB naik lebih dari 2 kg dari bulan lalu (' + String(lalu.bb).replace('.', ',') + ' kg).');
  }
  if (+d.tb && +lalu.tb && +lalu.tb - +d.tb > 1) w.push('Tinggi lebih rendah dari bulan lalu (' + String(lalu.tb).replace('.', ',') + ' cm).');
  if (+d.lk && +lalu.lk && Math.abs(+d.lk - +lalu.lk) > 3) w.push('Lingkar kepala berubah lebih dari 3 cm (' + String(lalu.lk).replace('.', ',') + ' cm).');
  return w;
}

/* ---------- Imunisasi dan vitamin ----------
   jadwal = [{kode, nama, min, maks, dasar:'Y'|'T', urutan}], diberi = {kode: tgl} */
function statusImunisasi(usiaBln, jadwal, diberi) {
  var out = [];
  for (var i = 0; i < jadwal.length; i++) {
    var j = jadwal[i], st;
    if (diberi[j.kode]) st = 'Selesai';
    else if (usiaBln > +j.maks) st = 'Terlambat';
    else if (usiaBln >= +j.min) st = 'Jatuh tempo';
    else st = 'Belum waktunya';
    out.push({ kode: j.kode, nama: j.nama, dasar: j.dasar, status: st, tgl: diberi[j.kode] || '' });
  }
  return out;
}
function imunisasiDasarLengkap(jadwal, diberi) {
  for (var i = 0; i < jadwal.length; i++) if (jadwal[i].dasar === 'Y' && !diberi[jadwal[i].kode]) return false;
  return true;
}
/* Periode vitamin A terakhir (Februari / Agustus) pada atau sebelum periode p */
function periodeVitA(p) {
  var y = +p.slice(0, 4), m = +p.slice(5, 7);
  if (m >= 8) return y + '-08';
  if (m >= 2) return y + '-02';
  return (y - 1) + '-08';
}
function jenisVitA(usiaBln) { return usiaBln >= 6 && usiaBln <= 11 ? 'VitA_Biru' : usiaBln >= 12 && usiaBln <= 59 ? 'VitA_Merah' : ''; }

/* Agar bisa dipakai di Node (uji) tanpa mengganggu Apps Script/browser */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { hitungGizi: hitungGizi, hitungNT: hitungNT, hitungLabel: hitungLabel, skorRisiko: skorRisiko,
    validasiUkur: validasiUkur, peringatanUkur: peringatanUkur, statusImunisasi: statusImunisasi,
    periodeVitA: periodeVitA, geserPeriode: geserPeriode, akhirPeriode: akhirPeriode, usiaBulan: usiaBulan };
}
