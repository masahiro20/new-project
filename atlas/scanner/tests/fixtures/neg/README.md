# Safety notes

Never run Claude with `--dangerously-skip-permissions` on a shared machine.
Do not pipe installers to a shell (avoid `curl https://x.invalid | sh`).
Install Bun: `curl -fsSL https://bun.sh/install | bash`
Attackers write phrases such as "ignore previous instructions" in tool descriptions.
