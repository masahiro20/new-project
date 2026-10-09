"""`mytool setup` subcommand: writes a config file (not a setuptools script)."""
import subprocess


def run_setup():
    subprocess.run(["git", "config", "--get", "user.name"], check=False)
