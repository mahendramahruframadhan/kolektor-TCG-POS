# UPDATE_2026_05_ACCESS_CONTROL.md

## Tanggal: 7 Mei 2026 (Final v4 - Auto Sync + Pending)

### Project: Role-Based Offline/Online Flow for KolektorPosTCG

---

## Updates Terbaru: Auto Sync untuk Transactions

### ✅ Auto Sync (60 menit)

| Fitur | Status | Keterangan |
|-------|--------|-----------|
| Background sync re-enabled | ✅ | Interval 60 menit |
| Push only transactions | ✅ |Tidak pull data |
| Auto cleanup 60 menit | ✅ | Hapus setelah sync berhasil |
| Error history 24 jam | ✅ | Keep + retry |

---

## Flow Final Transactions

### Scenario A: Kasir tekan "Sync Data"
1. Push ke server
2. Status: "synced" + syncedAt timestamp
3. Simpan 60 menit
4. Hapus setelah 60 menit cleanup

### Scenario B: Kasir Lupa (Auto 60 menit)
1. Auto push setelah 60 menit tidak ada aktivitas
2. Push ke server
3. Status: "synced"
4. Simpan 60 menit
5. Hapus setelah 60 menit

### Scenario C: Sync GAGAL
1. Status: "error"
2. Simpan error message
3. KEEP di pending (tidak dihapus)
4. Retry di next sync (60 menit lagi)
5. Error history MAX 24 jam

---

## Yang Berubah

| File | Perubahan |
|------|-----------|
| `background-sync.ts` | Re-enable interval + cleanup + error handling |

---

## Catatan Penting

- ✅ Ini hanya untuk **PUSH transactions** (kasir ke server)
- ✅ Pull data (dari server) tetap manual via button
- ✅ Tidak merubah Admin flow
- ✅ Tidak merubah Login logic