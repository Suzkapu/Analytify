"""Restore the documented, isolated WPE runtime without modifying host packages.

Run from the repository root. Archive packages are cached in ignored node_modules;
extracted runtime files and the Playwright config remain temporary.
"""
from pathlib import Path
import hashlib
import io
import tarfile
import urllib.request

repo = Path(__file__).resolve().parent.parent
cache = repo / 'node_modules/.cache/analytify-webkit-packages'
runtime = Path('/tmp/analytify-webkit-libs')
cache.mkdir(parents=True, exist_ok=True)
runtime.mkdir(parents=True, exist_ok=True)
packages = [
    ('https://archive.ubuntu.com/ubuntu/pool/main/i/icu/libicu74_74.2-1ubuntu3.1_amd64.deb',
     'c9a70989678660eed9a1e904c74fa043da8bec8e2036856fc16e31ced79b04f8'),
    ('https://archive.ubuntu.com/ubuntu/pool/main/libx/libxml2/libxml2_2.9.14+dfsg-1.3ubuntu3.9_amd64.deb',
     '6e578bc383096718c9eea8a76a3edfacfea06e525e1aa7a187ee41906436d94e'),
    ('https://archive.ubuntu.com/ubuntu/pool/universe/f/flite/libflite1_2.2-6build3_amd64.deb',
     '367f1d0da5cd38759a0515eafc27aa133b2d7bf99308cac34831df0212e96b75')
]
for url, expected in packages:
    package = cache / url.rsplit('/', 1)[1]
    if not package.exists():
        urllib.request.urlretrieve(url, package)
    data = package.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f'Archive hash mismatch: {package.name}')
    if data[:8] != b'!<arch>\n':
        raise ValueError(f'Invalid archive: {package.name}')
    offset = 8
    extracted = False
    while offset < len(data):
        header = data[offset:offset + 60]
        name = header[:16].decode().strip().rstrip('/')
        size = int(header[48:58])
        payload = data[offset + 60:offset + 60 + size]
        offset += 60 + size + size % 2
        if name.startswith('data.tar'):
            with tarfile.open(fileobj=io.BytesIO(payload), mode='r:*') as archive:
                archive.extractall(runtime / 'root', filter='data')
            extracted = True
    if not extracted:
        raise ValueError(f'No library payload: {package.name}')
    print(package.name, expected)

browser = Path.home() / '.cache/ms-playwright/webkit-2359/minibrowser-wpe'
if not (browser / 'bin/MiniBrowser').is_file():
    raise FileNotFoundError('Install the repository Playwright WebKit browser first.')
wrapper = runtime / 'run-webkit.sh'
wrapper.write_text(f'''#!/bin/sh
webkit_runtime='{browser}'
export WEBKIT_EXEC_PATH="$webkit_runtime/bin"
export WEBKIT_INJECTED_BUNDLE_PATH="$webkit_runtime/lib"
export WEBKIT_INSPECTOR_RESOURCES_PATH="$webkit_runtime/share"
export LD_LIBRARY_PATH="$webkit_runtime/lib:$webkit_runtime/sys/lib:{runtime}/root/usr/lib/x86_64-linux-gnu"
exec "$webkit_runtime/bin/MiniBrowser" "$@"
''')
wrapper.chmod(0o755)
Path('/tmp/analytify-all-browsers.config.ts').write_text(f'''import config from '{repo}/playwright.config';
export default {{...config,testDir:'{repo}/e2e',webServer:{{...config.webServer,cwd:'{repo}'}},projects:config.projects!.map(project=>project.name==='webkit-stats'?{{...project,use:{{...project.use,launchOptions:{{executablePath:'{wrapper}'}}}}}}:project)}};
''')
