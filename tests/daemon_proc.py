"""Start the VitalGrid daemon from this repository, on Windows or Linux."""

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def daemon_executable():
    names = (
        ("vitalgrid_daemon.exe", "vitalgrid_daemon")
        if os.name == "nt"
        else ("vitalgrid_daemon", "vitalgrid_daemon.exe")
    )
    for name in names:
        path = ROOT / name
        if path.is_file():
            return str(path)
    raise FileNotFoundError(
        "No está el demonio compilado en la raíz del repo "
        "(vitalgrid_daemon o vitalgrid_daemon.exe). Compilá con make o build.bat."
    )


def start_daemon(port):
    return subprocess.Popen(
        [daemon_executable(), str(port)],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
