#!/usr/bin/env bash
# Runs the whole QA suite sequentially against mech-game/index.html (rebuild first). Logs -> qa/*.log
cd "$(dirname "$0")"
bash /home/user/new-project/mech-game/build.sh
rc=0
bash t6_terms.sh > t6.log 2>&1 || rc=1
for t in t1_integration t2_input t3_touch t4_outcome t4b_timeout_real t5_pause; do
  echo "== $t"; timeout 900 node $t.js > $t.log 2>&1 || rc=1; grep -E "^(FAIL|===)" $t.log
done
exit $rc
