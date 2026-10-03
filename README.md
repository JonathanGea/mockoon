# Centralized mock backend

Satu repository, satu Mockoon server, dan satu port untuk beberapa project.
Setiap `data/<project>/environment.json` merupakan environment native Mockoon
sehingga tetap dapat diedit melalui Mockoon Desktop.

## Menjalankan lokal

Gunakan Node.js 22 atau lebih baru:

```sh
npm ci
npm start
```

Default lokal adalah `http://localhost:3000`. Untuk mengganti port:

```sh
PORT=4000 npm start
```

Contoh endpoint existing:

| Project | Endpoint |
| --- | --- |
| ecommerce | `GET /ecommerce/products`, `GET /ecommerce/products/101`, `POST /ecommerce/orders` |
| church | `GET /church/public/home`, `POST /church/auth/login` |
| motorcycle | `GET /motorcycle/motors`, `GET /motorcycle/users` |
| server | `GET /health` → `200 {"status":"ok"}` |

Migrasi namespace: marketplace sebelumnya `/api/...` menjadi `/ecommerce/...`;
website sebelumnya tanpa prefix menjadi `/church/...`; template motor sebelumnya
`/api/...` menjadi `/motorcycle/...`. Perbarui base URL client. Alias URL lama
tidak disediakan karena dapat menimbulkan konflik antar-project.

## Struktur dan startup

```text
data/
  ecommerce/environment.json
  church/environment.json
  motorcycle/environment.json
  <project>/fixtures/          # opsional
  shared/fixtures/             # opsional; bukan project
scripts/
  compose.mjs
  start.mjs
  new-project.mjs
```

Startup menemukan seluruh folder project (kecuali `shared`), membaca
`environment.json`, memigrasikan masing-masing konfigurasi di memory menggunakan
versi Mockoon yang dipin, lalu menggabungkannya menjadi file sementara. Source
JSON tidak ditulis ulang. Generated file dibersihkan saat server berhenti.

Namespace harus sama dengan nama folder: `endpointPrefix: "ecommerce"`, dengan
endpoint relatif `products`. Composer menghasilkan `/ecommerce/products`.
Project baru otomatis ditemukan tanpa perubahan script atau Dockerfile.
Folder yang bukan `shared` wajib mempunyai `environment.json`.

Server global menggunakan CORS untuk origin `*`, tanpa credential cookies,
HTTP, proxy disabled, dan latency global nol. Railway menyediakan HTTPS di
public domain. Source project harus mengaktifkan CORS serta menonaktifkan
TLS dan proxy. Header project diterapkan ke response (header response menang);
latency project ditambahkan ke latency response. Urutan route/folder sumber
dipertahankan. WebSocket belum didukung oleh composer.

`PORT` dibaca saat startup; nilainya harus 1–65535. Tanpa variable tersebut,
port lokal adalah 3000. Host server gabungan selalu `0.0.0.0`. Port source
JSON hanya digunakan ketika menjalankan project secara terpisah.
Mockoon admin API dinonaktifkan pada server gabungan.

## Menambahkan project

```sh
npm run new-project -- project3
npm run validate
npm start
```

Endpoint awal: `GET /project3/example`. Generator membuat identifier unik dan
menolak menimpa environment existing. Buka file baru di Mockoon Desktop untuk
menambah route, response, dan rules. Jika membuka beberapa project bersamaan,
gunakan port lokal berbeda pada masing-masing environment.

Untuk menjalankan hanya satu project:

```sh
npx --no-install mockoon-cli start --data data/ecommerce/environment.json --port 3001 --hostname 0.0.0.0 --disable-admin-api
```

Restart server gabungan setelah perubahan konfigurasi; belum ada hot reload.

## Menambahkan endpoint dan fixture

Tambahkan route relatif seperti `users` atau `users/:id` dalam environment
project. Jangan menulis prefix project lagi pada endpoint. Gunakan Mockoon
Desktop agar UUID dan referensi folder dibuat dengan benar. Route statis seperti
`users/search` harus ditempatkan sebelum `users/:id`.

Response kecil dapat tetap inline. Untuk payload besar, pilih response file
dan gunakan path relatif dari environment source, misalnya
`fixtures/products.json`. Shared fixture dapat dirujuk menggunakan
`../shared/fixtures/countries.json`. Composer mengubah file path relatif menjadi
absolute runtime path agar generated environment di direktori sementara tetap
menemukan fixture. File statis yang hilang menyebabkan startup gagal; path
dengan template diperiksa oleh Mockoon saat request.

Perbarui sendiri URL dalam body, header `Location`, response rule untuk path,
dan callback URL ketika mengganti namespace. Composer tidak menebak makna string
arbitrer di dalam mock. Gunakan nama bucket dan global variable dengan prefix
project jika kelak diperlukan, karena semuanya berbagi satu runtime. UUID
harus unik; copy-paste environment tanpa membuat identifier baru akan ditolak.

Mock existing tetap statis: create/update/delete tidak menyimpan data, autentikasi
adalah simulasi, dan respons error memerlukan rules agar dapat dipilih berdasarkan
request. Template POST/PATCH motor mengembalikan request body sebagai JSON.
Untuk stateful mock, gunakan Data Bucket/CRUD Mockoon; state memory hilang saat
restart dan tidak dibagi antar-replica.

## Verifikasi

```sh
npm run validate
npm test
```

Validasi menolak konflik method/path, benturan identifier, referensi folder atau
bucket/callback rusak, prefix tidak konsisten, dan konfigurasi server unsupported.
Test menjalankan server sungguhan dengan port dinamis, mengakses ketiga project,
menambahkan project otomatis dan shared fixture dalam workspace sementara,
memeriksa CORS/Location, serta memastikan shutdown membersihkan generated file.

## Docker dan Railway

```sh
docker build -t centralized-mock .
docker run --rm -p 3000:3000 centralized-mock
# Simulasi port yang diberikan platform:
docker run --rm -e PORT=4000 -p 4000:4000 centralized-mock
```

Railway default detection cukup: repository sudah memiliki Dockerfile dan Railway
menggunakannya otomatis. Tidak membutuhkan `railway.json`, Nixpacks config,
start-command override, database, atau volume untuk mock statis.

1. Deploy repository sebagai satu Railway service dengan repository root sebagai root directory.
2. Biarkan Dockerfile build dan CMD default berjalan.
3. Generate public domain pada Networking.
4. Set Healthcheck Path menjadi `/health` di dashboard.

Railway menyediakan `PORT`; jangan hardcode port production atau menetapkan target
port yang berbeda. `EXPOSE 3000` hanyalah metadata image, bukan port runtime.
Healthcheck menguji kesiapan deployment, bukan monitoring berkelanjutan.

Dependency Mockoon dipin di package.json dan lockfile; Docker menggunakan `npm ci`.
Saat upgrade, selaraskan versi CLI dan commons lalu jalankan validasi dan test.

## Membuat mock dari repository aplikasi lain

Gunakan [aturan portable dan prompt Codex](docs/PROJECT_RULES.md). Dokumen tersebut
berisi template lengkap sehingga dapat diberikan ke Codex di repository lain.
Copy folder hasil ke `data/<slug>/`, jalankan `npm run validate`, lalu restart.
Template terpisah tersedia di [templates/environment.json](templates/environment.json).
