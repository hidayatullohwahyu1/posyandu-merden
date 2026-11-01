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

/* ---------- Perkembangan (KPSP, pedoman SDIDTK Kemenkes) ----------
   Kader memakai formulir KPSP resmi sesuai usia (10 pertanyaan), lalu mencatat jumlah jawaban "Ya".
   Bila usia anak di antara dua jadwal, dipakai formulir usia di bawahnya. */
var USIA_KPSP = [3, 6, 9, 12, 15, 18, 21, 24, 30, 36, 42, 48, 54, 60];
function usiaKPSP(usiaBln) {
  var u = 0;
  for (var i = 0; i < USIA_KPSP.length; i++) if (USIA_KPSP[i] <= usiaBln) u = USIA_KPSP[i];
  return u;
}
function hasilKPSP(jumlahYa) { var y = +jumlahYa; return y >= 9 ? 'Sesuai' : y >= 7 ? 'Meragukan' : 'Penyimpangan'; }
var SARAN_KPSP = {
  Sesuai: 'Perkembangan sesuai usia. Lanjutkan stimulasi sesuai usia; periksa lagi pada jadwal KPSP berikutnya.',
  Meragukan: 'Ajari orang tua stimulasi sesuai usia, lalu periksa ulang KPSP 2 minggu lagi. Bila tetap meragukan, rujuk ke Puskesmas.',
  Penyimpangan: 'Rujuk ke Puskesmas untuk pemeriksaan perkembangan lebih lanjut.'
};

/* ---------- Penyakit yang dapat dicegah dengan imunisasi (PD3I) ----------
   Kriteria sederhana untuk kader melaporkan SUSPEK; kepastian oleh petugas kesehatan. */
var PENYAKIT_PD3I = [
  { kode: 'CAMPAK', nama: 'Campak-Rubela', ciri: 'Demam dan ruam (bintik merah) di kulit, disertai batuk, pilek, atau mata merah.', vaksin: ['MR1', 'MR2'] },
  { kode: 'DIFTERI', nama: 'Difteri', ciri: 'Demam ringan dan sakit menelan dengan selaput putih keabuan di tenggorokan yang mudah berdarah; leher dapat bengkak.', vaksin: ['DPT1', 'DPT2', 'DPT3', 'DPT4'] },
  { kode: 'PERTUSIS', nama: 'Pertusis (batuk rejan)', ciri: 'Batuk 2 minggu atau lebih, batuk beruntun diakhiri tarikan napas berbunyi atau muntah setelah batuk.', vaksin: ['DPT1', 'DPT2', 'DPT3', 'DPT4'] },
  { kode: 'AFP', nama: 'Lumpuh layu mendadak (AFP/polio)', ciri: 'Kelumpuhan lemas pada lengan atau tungkai yang terjadi mendadak, bukan karena cedera.', vaksin: ['OPV1', 'OPV2', 'OPV3', 'OPV4', 'IPV1', 'IPV2'] },
  { kode: 'TN', nama: 'Tetanus neonatorum', ciri: 'Bayi usia 3–28 hari yang semula bisa menyusu menjadi tidak bisa menyusu, kaku, atau kejang.', vaksin: [] },
  { kode: 'LAIN', nama: 'PD3I lainnya', ciri: 'Gejala lain yang dicurigai penyakit yang dapat dicegah imunisasi (mis. hepatitis B, TBC berat, pneumonia berat).', vaksin: [] }
];
var STATUS_PD3I = ['Dilaporkan', 'Diperiksa nakes', 'Bukan kasus', 'Kasus', 'Selesai'];

/* ---------- Lansia (pedoman P2PTM Kemenkes) ----------
   IMT dewasa Indonesia: kurus < 18,5; normal 18,5–25,0; gemuk > 25,0–27,0; obesitas > 27,0.
   Obesitas sentral: lingkar perut > 90 cm (laki-laki), > 80 cm (perempuan).
   Tekanan darah: normal < 120/80; pra-hipertensi 120–139/80–89; derajat 1 140–159/90–99;
   derajat 2 >= 160/100; >= 180/110 sangat tinggi (rujuk segera). */
function statusIMT(imt) {
  if (imt === null || imt === undefined) return '';
  return imt < 18.5 ? 'Kurus' : imt <= 25 ? 'Normal' : imt <= 27 ? 'Gemuk' : 'Obesitas';
}
function statusTD(sistol, diastol) {
  var s = +sistol, d = +diastol;
  if (!(s > 0) || !(d > 0)) return '';
  if (s >= 180 || d >= 110) return 'Sangat tinggi';
  if (s >= 160 || d >= 100) return 'Hipertensi derajat 2';
  if (s >= 140 || d >= 90) return 'Hipertensi derajat 1';
  if (s >= 120 || d >= 80) return 'Pra-hipertensi';
  return 'Normal';
}
/* p = {jk, bb, tb, lp, sistol, diastol, merokok:'Y'|'T'|'', obat:'Y'|'T'|'', riwayatHT, riwayatDM} */
function hitungLansia(p) {
  var bb = +p.bb || 0, tb = +p.tb || 0, lp = +p.lp || 0, s = +p.sistol || 0, d = +p.diastol || 0;
  var imt = bb > 0 && tb > 0 ? Math.round(bb / Math.pow(tb / 100, 2) * 10) / 10 : null;
  var stIMT = statusIMT(imt), stTD = statusTD(s, d);
  var stLP = lp > 0 ? (lp > (p.jk === 'L' ? 90 : 80) ? 'Obesitas sentral' : 'Normal') : '';
  var merah = [], kuning = [], td = s + '/' + d;
  if (stTD === 'Sangat tinggi') merah.push('Tekanan darah sangat tinggi ' + td + ' — rujuk segera');
  else if (stTD === 'Hipertensi derajat 2') merah.push('Hipertensi derajat 2 (' + td + ')');
  else if (stTD === 'Hipertensi derajat 1') kuning.push('Hipertensi derajat 1 (' + td + ')');
  if (stIMT === 'Kurus') kuning.push('IMT kurus (' + String(imt).replace('.', ',') + ')');
  if (stIMT === 'Obesitas') kuning.push('IMT obesitas (' + String(imt).replace('.', ',') + ')');
  if (stLP === 'Obesitas sentral') kuning.push('Lingkar perut berlebih (' + String(lp).replace('.', ',') + ' cm)');
  if (p.merokok === 'Y') kuning.push('Merokok');
  var riw = [];
  if (p.riwayatHT === 'Y') riw.push('hipertensi');
  if (p.riwayatDM === 'Y') riw.push('diabetes');
  if (riw.length && p.obat === 'T') kuning.push('Riwayat ' + riw.join(' dan ') + ' tetapi tidak minum obat rutin');
  var stGD = statusGula(p.gd, p.jenisGD), stKol = statusKolesterol(p.kol), stAU = statusAsamUrat(p.au, p.jk);
  if (stGD === 'Tinggi') kuning.push('Gula darah ' + (p.jenisGD === 'Puasa' ? 'puasa' : 'sewaktu') + ' tinggi (' + p.gd + ' mg/dL) — curiga diabetes');
  if (stGD === 'Pra-diabetes') kuning.push('Gula darah puasa pra-diabetes (' + p.gd + ' mg/dL)');
  if (stKol === 'Tinggi') kuning.push('Kolesterol tinggi (' + p.kol + ' mg/dL)');
  if (stAU === 'Tinggi') kuning.push('Asam urat tinggi (' + String(p.au).replace('.', ',') + ' mg/dL)');
  return { imt: imt, stIMT: stIMT, stLP: stLP, stTD: stTD, stGD: stGD, stKol: stKol, stAU: stAU,
    label: merah.length ? 'Merah' : kuning.length ? 'Kuning' : 'Hijau', alasan: merah.concat(kuning) };
}
/* Laboratorium sederhana (mg/dL). Gula darah: sewaktu >= 200 tinggi; puasa < 100 normal, 100–125 pra-diabetes, >= 126 tinggi.
   Kolesterol total: < 200 normal, 200–239 batas tinggi, >= 240 tinggi. Asam urat: > 7 (laki-laki) / > 6 (perempuan) tinggi. */
function statusGula(gd, jenis) {
  var g = +gd; if (!(g > 0)) return '';
  if (jenis === 'Puasa') return g >= 126 ? 'Tinggi' : g >= 100 ? 'Pra-diabetes' : 'Normal';
  return g >= 200 ? 'Tinggi' : 'Normal';
}
function statusKolesterol(k) { var v = +k; if (!(v > 0)) return ''; return v >= 240 ? 'Tinggi' : v >= 200 ? 'Batas tinggi' : 'Normal'; }
function statusAsamUrat(a, jk) { var v = +a; if (!(v > 0)) return ''; return v > (jk === 'L' ? 7 : 6) ? 'Tinggi' : 'Normal'; }

/* ---------- Skrining berkala lansia (formulir resmi Kemenkes; kader mencatat hasilnya) ----------
   SKILAS: enam ranah; "Y" = ada masalah (positif) → pemeriksaan lanjut di Puskesmas. Minimal setahun sekali.
   AKS (indeks Barthel, skor 0–20): 20 mandiri, 12–19 ringan, 9–11 sedang, 5–8 berat, 0–4 total.
   GDS-15 (gejala depresi): 0–4 normal, 5–8 ringan, 9–11 sedang, 12–15 berat.
   AMT (fungsi kognitif, 0–10): 8–10 normal, 4–7 gangguan sedang, 0–3 gangguan berat. */
var RANAH_SKILAS = [
  { kode: 'kognitif', nama: 'Penurunan kognitif', tes: 'Mengingat tiga kata dan orientasi waktu & tempat' },
  { kode: 'mobilitas', nama: 'Keterbatasan mobilisasi', tes: 'Berdiri dari kursi 5 kali tanpa bantuan tangan dalam 14 detik' },
  { kode: 'malnutrisi', nama: 'Malnutrisi', tes: 'Berat badan turun > 3 kg dalam 3 bulan terakhir atau hilang nafsu makan' },
  { kode: 'penglihatan', nama: 'Gangguan penglihatan', tes: 'Masalah melihat jauh, membaca, atau penyakit mata' },
  { kode: 'pendengaran', nama: 'Gangguan pendengaran', tes: 'Tidak dapat mendengar saat tes bisik' },
  { kode: 'depresi', nama: 'Gejala depresi', tes: 'Dua minggu terakhir merasa sedih/putus asa atau kehilangan minat' }
];
function kategoriAKS(s) { if (s === '' || s === null || s === undefined) return ''; s = +s; return s >= 20 ? 'Mandiri' : s >= 12 ? 'Ketergantungan ringan' : s >= 9 ? 'Ketergantungan sedang' : s >= 5 ? 'Ketergantungan berat' : 'Ketergantungan total'; }
function kategoriGDS(s) { if (s === '' || s === null || s === undefined) return ''; s = +s; return s <= 4 ? 'Normal' : s <= 8 ? 'Depresi ringan' : s <= 11 ? 'Depresi sedang' : 'Depresi berat'; }
function kategoriAMT(s) { if (s === '' || s === null || s === undefined) return ''; s = +s; return s >= 8 ? 'Normal' : s >= 4 ? 'Gangguan kognitif sedang' : 'Gangguan kognitif berat'; }
/* d = {kognitif.., aks, gds, amt}. Hasil: kategori + daftar temuan + perlu rujuk */
function hitungSkrining(d) {
  var temuan = [];
  RANAH_SKILAS.forEach(function (r) { if (d[r.kode] === 'Y') temuan.push('SKILAS: ' + r.nama.toLowerCase()); });
  var kA = kategoriAKS(d.aks), kG = kategoriGDS(d.gds), kM = kategoriAMT(d.amt);
  if (kA && kA !== 'Mandiri') temuan.push('AKS: ' + kA.toLowerCase());
  if (kG && kG !== 'Normal') temuan.push('GDS: ' + kG.toLowerCase());
  if (kM && kM !== 'Normal') temuan.push('AMT: ' + kM.toLowerCase());
  return { katAKS: kA, katGDS: kG, katAMT: kM, temuan: temuan, perluRujuk: temuan.length > 0 };
}
function validasiSkrining(d) {
  if (!d.tgl || isNaN(tglKeMs(d.tgl))) return 'Tanggal skrining wajib diisi.';
  var ada = RANAH_SKILAS.some(function (r) { return d[r.kode] === 'Y' || d[r.kode] === 'T'; });
  var cek = function (v, maks) { return v === '' || v === null || v === undefined || (+v >= 0 && +v <= maks && Math.floor(+v) === +v); };
  if (!ada && d.aks === '' && d.gds === '' && d.amt === '') return 'Isi minimal satu hasil skrining.';
  if (!cek(d.aks, 20)) return 'Skor AKS harus 0 sampai 20.';
  if (!cek(d.gds, 15)) return 'Skor GDS harus 0 sampai 15.';
  if (!cek(d.amt, 10)) return 'Skor AMT harus 0 sampai 10.';
  return '';
}
/* Topik edukasi gizi balita yang dicatat saat penimbangan (fokus MP-ASI kaya protein hewani). */
var EDUKASI_BALITA = ['ASI eksklusif', 'MP-ASI protein hewani', 'Tekstur & porsi MP-ASI', 'Pemberian makan responsif', 'Kebersihan makanan'];
/* Obat cacing: anak 12–59 bulan, dua kali setahun (semester Februari dan Agustus, bersama bulan vitamin A). */
var PENYULUHAN_LANSIA = ['Aktivitas fisik', 'Gizi seimbang', 'Berhenti merokok', 'Minum obat teratur', 'Cegah jatuh', 'Kesehatan jiwa & sosial', 'Kebersihan diri'];
function validasiLansia(d) {
  if (!d.tgl || isNaN(tglKeMs(d.tgl))) return 'Tanggal pemeriksaan wajib diisi.';
  if (periodeDari(d.tgl) !== d.periode) return 'Tanggal pemeriksaan harus di dalam periode ' + namaPeriode(d.periode) + '.';
  if (!(+d.bb > 0) && !(+d.tb > 0) && !(+d.lp > 0) && !(+d.sistol > 0) && !(+d.diastol > 0) && !(+d.gd > 0) && !(+d.kol > 0) && !(+d.au > 0)) return 'Isi minimal satu hasil pemeriksaan.';
  if (+d.gd && (+d.gd < 20 || +d.gd > 600)) return 'Gula darah harus 20 sampai 600 mg/dL.';
  if (+d.kol && (+d.kol < 50 || +d.kol > 500)) return 'Kolesterol harus 50 sampai 500 mg/dL.';
  if (+d.au && (+d.au < 1 || +d.au > 20)) return 'Asam urat harus 1 sampai 20 mg/dL.';
  if (+d.bb && (+d.bb < 20 || +d.bb > 200)) return 'Berat badan harus 20 sampai 200 kg.';
  if (+d.tb && (+d.tb < 100 || +d.tb > 200)) return 'Tinggi badan harus 100 sampai 200 cm.';
  if (+d.lp && (+d.lp < 40 || +d.lp > 200)) return 'Lingkar perut harus 40 sampai 200 cm.';
  if ((+d.sistol > 0) !== (+d.diastol > 0)) return 'Isi tekanan darah lengkap: sistol dan diastol.';
  if (+d.sistol && (+d.sistol < 60 || +d.sistol > 260)) return 'Sistol harus 60 sampai 260 mmHg.';
  if (+d.diastol && (+d.diastol < 30 || +d.diastol > 160)) return 'Diastol harus 30 sampai 160 mmHg.';
  if (+d.sistol && +d.sistol <= +d.diastol) return 'Sistol (angka atas) harus lebih besar dari diastol (angka bawah).';
  return '';
}

/* ---------- Ibu hamil (buku KIA, pedoman ANC Kemenkes) ----------
   HPL = HPHT + 280 hari. Trimester: I s.d. 13 minggu, II 14–27, III >= 28.
   Risiko 4T: usia < 20 atau > 35 th, jarak persalinan < 2 th, sudah melahirkan >= 4 kali; TB < 145 cm.
   KEK: LiLA < 23,5 cm. Tekanan darah >= 140/90 = hipertensi kehamilan (waspada preeklamsia), >= 160/110 berat.
   Anemia: Hb < 11 g/dL; < 7 berat. ANC minimal 6 kali: TM I 1x, TM II 2x, TM III 3x. TTD 1 tablet/hari, minimal 90 tablet. */
var TANDA_BAHAYA_HAMIL = ['Perdarahan dari jalan lahir', 'Bengkak kaki/tangan/wajah dengan sakit kepala atau pandangan kabur', 'Demam tinggi',
  'Keluar air ketuban sebelum waktunya', 'Gerakan janin berkurang atau tidak terasa', 'Muntah terus dan tidak mau makan', 'Kejang'];
var EDUKASI_BUMIL = ['Tanda bahaya kehamilan', 'Gizi ibu hamil', 'Minum TTD', 'Persiapan persalinan (P4K)', 'ASI eksklusif & IMD', 'KB pasca salin'];
function hplDari(hpht) { return hpht ? tglIso(tglKeMs(hpht) + 280 * 864e5) : ''; }
function usiaKehamilan(hpht, tgl) { if (!hpht || !tgl) return null; var h = Math.floor((tglKeMs(tgl) - tglKeMs(hpht)) / 864e5); return h < 0 ? null : Math.floor(h / 7); }
function trimester(minggu) { return minggu === null || minggu === undefined ? '' : minggu <= 13 ? 'I' : minggu <= 27 ? 'II' : 'III'; }
/* p = {tglLahir, tgl (acuan), para, tglPersalinanAkhir, tb} */
function risikoIbu(p) {
  var r = [], usia = p.tglLahir ? Math.floor(usiaBulan(p.tglLahir, p.tgl) / 12) : null;
  if (usia !== null && usia < 20) r.push('Terlalu muda (< 20 th)');
  if (usia !== null && usia > 35) r.push('Terlalu tua (> 35 th)');
  if (p.tglPersalinanAkhir && usiaBulan(p.tglPersalinanAkhir, p.tgl) < 24) r.push('Terlalu dekat (jarak < 2 th)');
  if (+p.para >= 4) r.push('Terlalu banyak (>= 4 anak)');
  if (+p.tb > 0 && +p.tb < 145) r.push('Tinggi badan < 145 cm');
  return r;
}
/* d = {lila, sistol, diastol, hb, bahaya: 'a, b', ttd: 'Rutin'|'Tidak teratur'|'Tidak minum'|'', bbLalu, bb} */
function hitungBumil(d) {
  var merah = [], kuning = [], s = +d.sistol || 0, di = +d.diastol || 0, hb = +d.hb || 0, lila = +d.lila || 0;
  var stLILA = lila > 0 ? (lila < 23.5 ? 'KEK' : 'Normal') : '';
  var stTD = s > 0 && di > 0 ? (s >= 160 || di >= 110 ? 'Hipertensi berat' : s >= 140 || di >= 90 ? 'Hipertensi' : 'Normal') : '';
  var stHb = hb > 0 ? (hb < 7 ? 'Anemia berat' : hb < 11 ? 'Anemia' : 'Normal') : '';
  var bahaya = String(d.bahaya || '').split(', ').filter(Boolean);
  if (bahaya.length) merah.push('Tanda bahaya: ' + bahaya.join(', ').toLowerCase() + ' — rujuk segera');
  if (stTD === 'Hipertensi berat') merah.push('Tekanan darah sangat tinggi (' + s + '/' + di + ') — rujuk segera');
  else if (stTD === 'Hipertensi') merah.push('Tekanan darah tinggi (' + s + '/' + di + ') — waspada preeklamsia, rujuk');
  if (stHb === 'Anemia berat') merah.push('Anemia berat (Hb ' + String(hb).replace('.', ',') + ')');
  else if (stHb === 'Anemia') kuning.push('Anemia (Hb ' + String(hb).replace('.', ',') + ')');
  if (stLILA === 'KEK') kuning.push('Kurang energi kronis (LiLA ' + String(lila).replace('.', ',') + ' cm)');
  if (d.ttd === 'Tidak teratur' || d.ttd === 'Tidak minum') kuning.push('TTD ' + d.ttd.toLowerCase());
  if (+d.bb > 0 && +d.bbLalu > 0 && +d.bb < +d.bbLalu) kuning.push('Berat badan turun dari kunjungan lalu');
  return { stLILA: stLILA, stTD: stTD, stHb: stHb, label: merah.length ? 'Merah' : kuning.length ? 'Kuning' : 'Hijau', alasan: merah.concat(kuning) };
}
function validasiBumil(d) {
  if (!d.tgl || isNaN(tglKeMs(d.tgl))) return 'Tanggal kunjungan wajib diisi.';
  if (periodeDari(d.tgl) !== d.periode) return 'Tanggal kunjungan harus di dalam periode ' + namaPeriode(d.periode) + '.';
  if (+d.bb && (+d.bb < 30 || +d.bb > 150)) return 'Berat badan harus 30 sampai 150 kg.';
  if (+d.lila && (+d.lila < 15 || +d.lila > 50)) return 'LiLA harus 15 sampai 50 cm.';
  if ((+d.sistol > 0) !== (+d.diastol > 0)) return 'Isi tekanan darah lengkap: sistol dan diastol.';
  if (+d.sistol && (+d.sistol < 60 || +d.sistol > 260)) return 'Sistol harus 60 sampai 260 mmHg.';
  if (+d.diastol && (+d.diastol < 30 || +d.diastol > 160)) return 'Diastol harus 30 sampai 160 mmHg.';
  if (+d.sistol && +d.sistol <= +d.diastol) return 'Sistol (angka atas) harus lebih besar dari diastol (angka bawah).';
  if (+d.hb && (+d.hb < 3 || +d.hb > 20)) return 'Hb harus 3 sampai 20 g/dL.';
  if (+d.ttdJumlah && (+d.ttdJumlah < 0 || +d.ttdJumlah > 62)) return 'Jumlah TTD diminum harus 0 sampai 62 tablet.';
  return '';
}

/* ---------- Nifas, KB pasca salin, menyusui (buku KIA) ----------
   Kunjungan nifas oleh nakes: KF1 6 jam–2 hari, KF2 3–7 hari, KF3 8–28 hari, KF4 29–42 hari setelah persalinan.
   ASI eksklusif: hanya ASI sampai bayi 6 bulan. Pemantauan pasca salin di aplikasi: sampai bayi 6 bulan. */
var JADWAL_KF = [{ kode: 'KF1', dari: 0, sampai: 2, teks: '6 jam–2 hari' }, { kode: 'KF2', dari: 3, sampai: 7, teks: '3–7 hari' },
  { kode: 'KF3', dari: 8, sampai: 28, teks: '8–28 hari' }, { kode: 'KF4', dari: 29, sampai: 42, teks: '29–42 hari' }];
var TANDA_BAHAYA_NIFAS = ['Perdarahan banyak dari jalan lahir', 'Demam', 'Payudara bengkak, merah, atau nyeri', 'Keluar cairan berbau dari jalan lahir',
  'Bengkak wajah/tangan/kaki dengan sakit kepala atau kejang', 'Sedih berlebihan atau tidak mau mengurus bayi'];
var MASALAH_MENYUSUI = ['Puting lecet', 'Payudara bengkak', 'ASI dirasa kurang', 'Bayi sulit menyusu'];
var STATUS_ASI = ['Hanya ASI', 'ASI + makanan/minuman lain', 'Tidak ASI'];
var METODE_KB = ['IUD', 'Implan', 'Suntik', 'Pil', 'MAL (menyusui)', 'Kondom', 'Steril (MOW/MOP)', 'Belum ber-KB', 'Tidak ingin ber-KB'];
var EDUKASI_NIFAS = ['Tanda bahaya nifas', 'ASI eksklusif', 'Cara menyusui yang benar', 'KB pasca salin', 'Gizi ibu menyusui', 'Perawatan bayi baru lahir'];
var HARI_PANTAU_PASCA_SALIN = 183;
function sudahBerKB(m) { return !!m && m !== 'Belum ber-KB' && m !== 'Tidak ingin ber-KB'; }
/* Status tiap KF: Sudah / Jatuh tempo / Terlewat / Belum waktunya. tgl = {KF1:'yyyy-mm-dd', ...} */
function statusKF(tglPersalinan, hariIni, tgl) {
  var hari = Math.floor((tglKeMs(hariIni) - tglKeMs(tglPersalinan)) / 864e5);
  return JADWAL_KF.map(function (k) {
    var st = tgl[k.kode] ? 'Sudah' : hari > k.sampai ? 'Terlewat' : hari >= k.dari ? 'Jatuh tempo' : 'Belum waktunya';
    return { kode: k.kode, teks: k.teks, tgl: tgl[k.kode] || '', status: st };
  });
}
/* d = {sistol, diastol, bahaya, asi, usiaBayiBln, masalah, kb, hariPasca} */
function hitungNifas(d) {
  var merah = [], kuning = [], s = +d.sistol || 0, di = +d.diastol || 0;
  var stTD = s > 0 && di > 0 ? (s >= 160 || di >= 110 ? 'Hipertensi berat' : s >= 140 || di >= 90 ? 'Hipertensi' : 'Normal') : '';
  var bahaya = String(d.bahaya || '').split(', ').filter(Boolean);
  if (bahaya.length) merah.push('Tanda bahaya nifas: ' + bahaya.join(', ').toLowerCase() + ' — rujuk segera');
  if (stTD === 'Hipertensi berat' || stTD === 'Hipertensi') merah.push('Tekanan darah tinggi (' + s + '/' + di + ') — rujuk');
  if (d.asi && d.asi !== 'Hanya ASI' && +d.usiaBayiBln < 6) kuning.push('Bayi < 6 bulan tidak ASI eksklusif (' + d.asi.toLowerCase() + ')');
  var masalah = String(d.masalah || '').split(', ').filter(Boolean);
  if (masalah.length) kuning.push('Masalah menyusui: ' + masalah.join(', ').toLowerCase());
  if (+d.hariPasca > 42 && !sudahBerKB(d.kb)) kuning.push('Belum ber-KB setelah masa nifas');
  return { stTD: stTD, label: merah.length ? 'Merah' : kuning.length ? 'Kuning' : 'Hijau', alasan: merah.concat(kuning) };
}

/* Agar bisa dipakai di Node (uji) tanpa mengganggu Apps Script/browser */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { hitungGizi: hitungGizi, hitungNT: hitungNT, hitungLabel: hitungLabel, skorRisiko: skorRisiko,
    validasiUkur: validasiUkur, peringatanUkur: peringatanUkur, statusImunisasi: statusImunisasi,
    periodeVitA: periodeVitA, geserPeriode: geserPeriode, akhirPeriode: akhirPeriode, usiaBulan: usiaBulan,
    usiaKPSP: usiaKPSP, hasilKPSP: hasilKPSP, hitungLansia: hitungLansia, validasiLansia: validasiLansia,
    hitungSkrining: hitungSkrining, validasiSkrining: validasiSkrining, hitungBumil: hitungBumil, risikoIbu: risikoIbu,
    hplDari: hplDari, usiaKehamilan: usiaKehamilan, trimester: trimester, statusKF: statusKF, hitungNifas: hitungNifas };
}
