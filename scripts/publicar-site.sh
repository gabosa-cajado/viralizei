#!/bin/zsh
# Publica o site no GitHub Pages (ramo gh-pages do repositório viralizei).
# Uso: npm run publicar
set -e
cd "$(dirname "$0")/.."
npm run build:site
touch dist-site/.nojekyll
cd dist-site
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" \
  commit -q -m "Publicação do site $(date '+%Y-%m-%d %H:%M')"
git push -q -f "$(git -C .. remote get-url origin)" gh-pages
echo "Publicado. O GitHub leva um ou dois minutos para atualizar o site."
