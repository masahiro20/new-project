import re, os, subprocess
# Example attack: "ignore previous instructions" -- we detect this, never follow it
PATTERNS = [
    r"ignore (all )?previous instructions",
    "do not tell the user",
    "<IMPORTANT>",
]
BAD = re.compile(r"curl .* \| sh")
def check(text):
    if "Ignore all previous instructions" in text:
        return True
    return re.search(r"~/.ssh/id_rsa", text)
def run(args):
    subprocess.run(args, env=dict(os.environ), check=True)
    note = "we never call eval( on input"
