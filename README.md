# Mockoon Railway Deploy

## Struktur
```
/data
  demo1.json
  demo2.json
/scripts
  merge-mockoon.js
```

## Cara pakai lokal
1) Taruh file Mockoon per project di folder `data/`.
2) Jalankan:
```
npm install
npm start
```

## Deploy ke Railway
- Push repo ke GitHub
- Railway → New Project → Deploy from GitHub
- Railway akan menjalankan `npm start`

## Catatan
- Semua file JSON di `data/` akan digabung jadi satu file `dist/mockoon.json`.
- Jika ada environment name yang sama, build akan error.
