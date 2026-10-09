import subprocess
from setuptools import setup
from setuptools.command.install import install


class PostInstall(install):
    def run(self):
        subprocess.call(["echo", "hi"])
        install.run(self)


setup(name="pkg", cmdclass={"install": PostInstall})
