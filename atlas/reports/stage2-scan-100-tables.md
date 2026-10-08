| Rule | v0 all | v0 src | v1 regex-only all | v1 all | v1 src+skill | v1 src+skill high/crit | suppressed | new via AST |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ATL-CE-001 | 329 | 60 | 360 | 345 | 113 | 0 | 359 | 344 |
| ATL-CE-002 | 100 | 31 | 100 | 95 | 12 | 0 | 89 | 84 |
| ATL-CR-001 | 84 | 52 | 84 | 11 | 1 | 1 | 79 | 6 |
| ATL-DP-001 | 7 | 3 | 7 | 7 | 3 | 0 | 0 | 0 |
| ATL-FS-001 | 179 | 79 | 179 | 132 | 55 | 0 | 47 | 0 |
| ATL-IN-001 | 21 | 19 | 21 | 21 | 19 | 6 | 0 | 0 |
| ATL-NW-001 | 101 | 47 | 101 | 87 | 21 | 0 | 61 | 47 |
| ATL-NW-002 | 64 | 48 | 47 | 36 | 20 | 0 | 11 | 0 |
| ATL-OB-001 | 14 | 4 | 14 | 7 | 4 | 0 | 7 | 0 |
| ATL-OB-003 | 14 | 0 | 14 | 13 | 0 | 0 | 14 | 13 |
| ATL-OB-004 | 12 | 5 | 12 | 8 | 1 | 0 | 4 | 0 |
| ATL-PL-001 | 19 | 19 | 19 | 19 | 19 | 0 | 0 | 0 |
| ATL-RF-001 | 244 | 100 | 244 | 216 | 72 | 6 | 28 | 0 |
| ATL-SK-001 | 37 | 1 | 37 | 7 | 0 | 0 | 30 | 0 |
| ATL-SK-002 | 255 | 190 | 255 | 255 | 189 | 0 | 0 | 0 |
| ATL-TP-001 | 25 | 10 | 25 | 24 | 9 | 9 | 1 | 0 |
| ATL-TP-002 | 14 | 5 | 15 | 13 | 5 | 5 | 2 | 0 |
| ATL-TP-003 | 85 | 18 | 91 | 45 | 8 | 3 | 46 | 0 |
| ATL-TP-004 | 36 | 5 | 36 | 32 | 2 | 2 | 4 | 0 |
| ATL-TP-005 | 6 | 2 | 6 | 6 | 1 | 0 | 0 | 0 |
| **Total** | **1646** | **698** | **1667** | **1379** | **554** | **32** | **782** | **494** |

Suppression reasons:

| Reason | Count |
|---|---:|
| not confirmed as executable code by AST | 323 |
| duplicate of AST finding | 275 |
| negated or cited as an example | 35 |
| inside a detection pattern / pattern list (AST) | 32 |
| quoted in documentation | 26 |
| inside a code comment (AST) | 23 |
| inside a detection pattern / assertion (AST) | 22 |
| placeholder, not a concrete command | 13 |
| inside a line comment (heuristic) | 11 |
| detection-rule file (YARA/semgrep) | 9 |
| assertion literal (AST) | 7 |
| embedded media (magic bytes) | 4 |
| inside a code comment (heuristic) | 2 |

Security-component score bucketed with the A-F thresholds (provenance/maintenance not collected in this run):

| Grade | Repos |
|---|---:|
| A | 78 |
| B | 10 |
| C | 7 |
| D | 0 |
| F | 5 |

Files: 36873. AST parsed: 16078, parse failed: 8, minified skipped: 3.
