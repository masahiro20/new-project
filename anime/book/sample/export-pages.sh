#!/bin/sh
# Export sample pages from the Vol.0 PDFs as PNG for the sample-page artifact.
set -e
cd "$(dirname "$0")"
mkdir -p pages
for lang in ja en; do
  for n in 1 5 7 10 13 15 16 17 20 25 28 30; do
    nn=$(printf '%02d' "$n")
    pdftoppm -f "$n" -l "$n" -singlefile -png -scale-to 840 "../vol0-$lang.pdf" "pages/$lang-$nn"
  done
done
du -sh pages
