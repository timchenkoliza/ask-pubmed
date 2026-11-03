# Спросить PubMed — прототип

Прототип поиска по PubMed для врачей: запрос своими словами → как поняли → выдача с объяснением.
Все публикации, журналы, счётчики и PMID вымышленные.

```
npm install
npm run typecheck
npm run build     # пишет public/index.html (для Vercel) и dist/index.html
```

`public/index.html` лежит в репозитории готовым: Vercel ничего не собирает, только раздаёт каталог `public`.
После правок в `src/` пересоберите (`npm run build`) и закоммитьте `public/index.html`.
