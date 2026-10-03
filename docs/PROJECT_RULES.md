# Aturan membuat project mock yang dapat dipindahkan

Dokumen ini dapat disalin ke repository frontend/backend lain dan diberikan ke
Codex sebagai instruksi. Output akhirnya cukup **satu folder project** yang
kemudian dipaste ke `data/` dalam repository centralized mock backend.

## Kontrak output

```text
<project-slug>/
  environment.json       # wajib: native Mockoon environment
  README.md              # wajib: endpoint, skenario, cara penggunaan
  fixtures/              # opsional: JSON, CSV, file response
    products.json
```

Misalnya hasil `inventory/` dipaste menjadi `data/inventory/`. Backend menemukan
folder tersebut pada startup berikutnya. Tidak perlu mengubah script startup,
Dockerfile, package.json, atau membuat service deployment baru.

Pembuatan project di repository lain tidak membutuhkan dependency Mockoon di
aplikasi tersebut. Folder hasil boleh disimpan di `mock-backend/<project-slug>/`
atau lokasi output yang diminta pengguna.

## Instruksi untuk Codex

1. Pelajari API yang dibutuhkan aplikasi: API client/service, type/interface,
   schema, form, halaman yang mengonsumsi API, dan dokumentasi existing.
   Jangan mengubah source aplikasi atau kontrak client untuk mempermudah mock.
2. Pilih slug yang stabil. Format: huruf kecil, dimulai huruf, selanjutnya huruf,
   angka, atau `-`. Contoh: `inventory`, `customer-portal`. Nama `shared`, `health`,
   dan `mockoon-admin` dicadangkan. Jika slug sudah ada di centralized backend,
   ini adalah update project existing, bukan project baru; jangan menimpanya
   tanpa instruksi pengguna.
3. Buat satu environment Mockoon berdasarkan template di bagian akhir dokumen.
   Target runtime saat ini **Mockoon CLI/commons 9.9.0, schema lastMigration 33**.
   Jangan mengubah lastMigration untuk menyamarkan schema yang tidak kompatibel.
4. Set `name` dan `endpointPrefix` menjadi slug. Endpoint route relatif, tanpa
   slash awal dan tanpa slug: `products`, `products/:id`, `admin/auth/login`.
   URL akhirnya adalah `/<slug>/<endpoint>`.
5. Buat UUID v4 baru untuk environment, route, response, folder, Data Bucket,
   dan callback. Jangan memakai UUID contoh atau identifier seperti `route-1`.
   Semua referensi harus menunjuk UUID yang benar. Setiap route/folder harus
   tercantum tepat satu kali di `rootChildren` atau `children` folder.
6. Pertahankan konfigurasi server: `cors: true`, `proxyMode: false`,
   `tlsOptions.enabled: false`, `hostname: "0.0.0.0"`. Port `3000` dalam source
   hanya default untuk pengembangan terpisah; server gabungan memakai `PORT`.
   Jangan menambahkan listener, Express server, reverse proxy, atau Dockerfile.
7. Gunakan route HTTP (`type: "http"`) untuk mock biasa. CRUD Mockoon boleh
   digunakan hanya jika diperlukan stateful behavior dan referensi bucket
   sudah benar. WebSocket tidak didukung oleh composer saat ini.
8. Response JSON menggunakan `Content-Type: application/json`. Payload harus
   mengikuti kontrak aplikasi: bentuk object, pagination, naming field, tipe ID,
   enum, tanggal, dan error envelope. Jangan memaksakan `{data: ...}` jika client
   mengharapkan format berbeda. Body `204` harus kosong.
9. Default response harus jelas. Untuk skenario alternatif gunakan rules yang
   benar-benar membedakan request. Respons berlabel `404`/`401` saja tidak
   menghasilkan lookup atau autentikasi. Jika diperlukan pemicu khusus untuk
   pengujian, gunakan query parameter terdokumentasi seperti `mockScenario`;
   jangan membutuhkan custom header baru yang tidak dilayani preflight global.
10. Urutkan endpoint statis sebelum parameter/wildcard yang dapat menangkapnya,
    misalnya `users/search` sebelum `users/:id`. Hindari catch-all jika tidak
    dibutuhkan. Jangan membuat duplicate method/path.
11. Gunakan data dummy yang konsisten antara list, detail, dan relasi. Jelaskan
    apakah ID tidak dikenal menghasilkan `404` atau detail statis. Mock POST,
    PATCH, dan DELETE tidak boleh diklaim persist jika sebenarnya stateless.
12. Hindari secret, token produksi, data personal asli, dan akses backend asli.
    Untuk auth mock gunakan token dummy. URL resource, `Location`, `instance`,
    dan callback harus mengikuti namespace slug, bukan `/api/...` generik.
13. Jangan menyisipkan object JSON tanpa nama properti di dalam object response.
    Untuk echo JSON request body gunakan `{{{body}}}`. Verifikasi hasil render,
    bukan hanya string template. Jika mengambil properti tertentu dari request,
    gunakan helper Mockoon yang sesuai dengan versi runtime.
14. Fixture harus portable: gunakan file response path relatif terhadap
    `environment.json`, misalnya `fixtures/products.json`. Jangan memasukkan
    absolute path komputer, symlink, URL file lokal, atau path ke source repo
    aplikasi. Seluruh file yang dibutuhkan harus berada di folder hasil.
15. Project portable tidak boleh bergantung pada `../shared/...` secara default.
    Shared fixture hanya digunakan ketika pengguna mengonfirmasi file tersebut
    sudah tersedia di centralized backend; dokumentasikan dependency-nya.
16. Nama Data Bucket dan global variable harus memiliki prefix slug, misalnya
    `inventory-products`. Identifier lintas-project wajib unik. Runtime, state,
    CORS, dan deployment dibagi bersama; namespace bukan isolasi keamanan.
17. Header environment diterapkan ke response; header response memiliki prioritas.
    CORS global menggunakan origin `*` tanpa credential cookies dan daftar
    header request standar. Jangan membuat kebijakan CORS khusus project.
18. Latency environment ditambahkan ke latency response. Jangan memberi latency
    besar tanpa kebutuhan pengujian. Tidak perlu membuat endpoint `/health`:
    server gabungan menyediakan route global tersebut.
19. Sertakan README project: base URL, tabel method/path/status, fixture, rules
    pemicu skenario, contoh request, dan keterbatasan state/auth. Berikan daftar
    file hasil dan informasi bahwa folder siap dipaste.
20. Verifikasi JSON source/fixtures, referensi UUID, dan konsistensi kontrak.
    Jika tool runtime tersedia, periksa hasil HTTP. Jangan mengklaim validasi
    runtime sudah dilakukan jika hanya membaca JSON.

## Prompt siap salin ke Codex di repository lain

```text
Pelajari codebase ini dan buatkan folder mock API portable untuk centralized
Mockoon backend. Ikuti seluruh aturan dalam PROJECT_RULES.md yang saya sertakan,
termasuk template environment pada dokumen tersebut.

Slug project: <ISI-SLUG>
Lokasi hasil: mock-backend/<ISI-SLUG>/

Temukan endpoint yang dibutuhkan dari API client, types, form, dan halaman
aplikasi. Buat environment.json native Mockoon, fixture bila diperlukan, serta
README project. Pertahankan kontrak request/response aplikasi. Semua dependency
fixture harus berada di dalam folder hasil; gunakan UUID v4 baru untuk setiap
entity dan pastikan referensinya benar.

URL yang akan digunakan frontend: https://<DOMAIN>/<ISI-SLUG>
Endpoint dalam environment harus relatif, tanpa slug pada route.

Jangan mengubah source aplikasi. Jangan membuat application server, dependency
runtime aplikasi, Dockerfile, railway.json, atau script deployment. Jangan
menganggap operasi mock menyimpan perubahan jika belum memakai CRUD/Data Bucket.

Hasil akhir harus bisa saya copy sebagai data/<ISI-SLUG>/ di centralized backend
kemudian jalankan npm run validate dan npm start tanpa mengubah core application.
Laporkan endpoint yang dibuat, skenario yang dapat diuji, asumsi kontrak yang
belum pasti, dan validasi yang benar-benar sudah dijalankan.
```

Ganti placeholder slug/domain sebelum mengirim. Lampirkan dokumen ini ke Codex;
Codex di repository lain tidak otomatis dapat membaca file di repository ini.

## Setelah folder dipaste ke centralized backend

```sh
npm run validate
npm test
npm start
```

Cek `GET /<slug>/example` atau endpoint project yang dibuat. Jika server sudah
berjalan, restart untuk membaca folder baru. Commit folder project untuk
memasukkannya ke deployment Railway berikutnya. Tidak diperlukan konfigurasi
Railway per project.

## Template native Mockoon

Template ini juga tersedia sebagai `templates/environment.json` di centralized
backend. **Ganti slug dan seluruh UUID**, lalu perbarui referensi `rootChildren`.
Tambahkan route menggunakan bentuk route/response yang sama. `body` merupakan
string, bukan object JSON; fixture file menggunakan `bodyType: "FILE"` dan
`filePath: "fixtures/<nama>.json"`.

```json
{
  "uuid": "64369641-bc33-4e57-b8ea-f8452ba617b8",
  "lastMigration": 33,
  "name": "project-slug",
  "endpointPrefix": "project-slug",
  "latency": 0,
  "port": 3000,
  "hostname": "0.0.0.0",
  "folders": [],
  "routes": [
    {
      "uuid": "f9a34ccb-19fd-42d1-89a7-b92c4f7d80a3",
      "type": "http",
      "documentation": "",
      "method": "get",
      "endpoint": "example",
      "responses": [
        {
          "uuid": "91f8132a-9618-40c5-9b0c-2fef9fc0b52b",
          "body": "{\"data\":{\"message\":\"Example\"}}",
          "latency": 0,
          "statusCode": 200,
          "label": "",
          "headers": [
            {
              "key": "Content-Type",
              "value": "application/json"
            }
          ],
          "bodyType": "INLINE",
          "filePath": "",
          "databucketID": "",
          "sendFileAsBody": false,
          "rules": [],
          "rulesOperator": "OR",
          "disableTemplating": false,
          "fallbackTo404": false,
          "default": true,
          "crudKey": "id",
          "callbacks": []
        }
      ],
      "responseMode": null,
      "streamingMode": null,
      "streamingInterval": 0
    }
  ],
  "rootChildren": [
    {
      "type": "route",
      "uuid": "f9a34ccb-19fd-42d1-89a7-b92c4f7d80a3"
    }
  ],
  "proxyMode": false,
  "proxyHost": "",
  "proxyRemovePrefix": false,
  "tlsOptions": {
    "enabled": false,
    "type": "CERT",
    "pfxPath": "",
    "certPath": "",
    "keyPath": "",
    "caPath": "",
    "passphrase": ""
  },
  "cors": true,
  "headers": [
    {
      "key": "Access-Control-Allow-Origin",
      "value": "*"
    },
    {
      "key": "Access-Control-Allow-Methods",
      "value": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS"
    },
    {
      "key": "Access-Control-Allow-Headers",
      "value": "Content-Type, Origin, Accept, Authorization, Content-Length, X-Requested-With"
    }
  ],
  "proxyReqHeaders": [
    {
      "key": "",
      "value": ""
    }
  ],
  "proxyResHeaders": [
    {
      "key": "",
      "value": ""
    }
  ],
  "data": [],
  "callbacks": []
}
```
