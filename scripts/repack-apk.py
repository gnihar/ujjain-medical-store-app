#!/usr/bin/env python3
"""Put the current public/ web app into the existing APK shell, align, and sign."""
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
import zlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC_APK = os.path.join(ROOT, 'UjjainMedStore-v1.0.apk')
OUT_APK = SRC_APK
PUBLIC = os.path.join(ROOT, 'public')
KEYSTORE = os.path.join(ROOT, 'apk-build', 'release-key.jks')
TOOLS = os.path.join(ROOT, 'apk-build', 'tools')
SIGNER = os.path.join(TOOLS, 'uber-apk-signer.jar')
SIGNER_URL = 'https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar'


def u16(n):
    return struct.pack('<H', n)


def u32(n):
    return struct.pack('<I', n)


def deflate(data):
    comp = zlib.compressobj(9, zlib.DEFLATED, -15)
    return comp.compress(data) + comp.flush()


def pack(entries, dest, alignment=4):
    blob = bytearray()
    central = []
    for name, data, method in entries:
        name_b = name.encode('utf-8')
        crc = zlib.crc32(data) & 0xFFFFFFFF
        payload = data if method == zipfile.ZIP_STORED else deflate(data)
        extra = b''
        if method == zipfile.ZIP_STORED:
            align = 4096 if name.endswith('.so') else alignment
            header_len = 30 + len(name_b)
            pad = (align - ((len(blob) + header_len) % align)) % align
            extra = b'\x00' * pad
        blob += b''.join([
            u32(0x04034B50), u16(20), u16(0), u16(method), u16(0), u16(0x21),
            u32(crc), u32(len(payload)), u32(len(data)),
            u16(len(name_b)), u16(len(extra)), name_b, extra, payload
        ])
        central.append((name_b, method, crc, len(payload), len(data), extra, len(blob) - len(payload) - 30 - len(name_b) - len(extra)))
    cd_off = len(blob)
    cd = bytearray()
    for name_b, method, crc, csz, usz, extra, rel in central:
        cd += b''.join([
            u32(0x02014B50), u16(20), u16(20), u16(0), u16(method),
            u16(0), u16(0x21), u32(crc), u32(csz), u32(usz),
            u16(len(name_b)), u16(len(extra)), u16(0), u16(0), u16(0), u32(0),
            u32(rel), name_b, extra
        ])
    blob += cd
    blob += b''.join([
        u32(0x06054B50), u16(0), u16(0), u16(len(central)), u16(len(central)),
        u32(len(cd)), u32(cd_off), u16(0)
    ])
    with open(dest, 'wb') as handle:
        handle.write(blob)


def public_files():
    files = {}
    for dirpath, _, names in os.walk(PUBLIC):
        if '/download' in dirpath.replace('\\', '/'):
            continue
        for name in names:
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, PUBLIC).replace('\\', '/')
            if rel.startswith('download/'):
                continue
            files['assets/' + rel] = open(full, 'rb').read()
    return files


def ensure_signer():
    if os.path.isfile(SIGNER) and os.path.getsize(SIGNER) > 100000:
        return SIGNER
    tmp = '/tmp/uber-apk-signer.jar'
    if os.path.isfile(tmp) and os.path.getsize(tmp) > 100000:
        os.makedirs(TOOLS, exist_ok=True)
        shutil.copy(tmp, SIGNER)
        return SIGNER
    os.makedirs(TOOLS, exist_ok=True)
    print('Downloading uber-apk-signer...')
    urllib.request.urlretrieve(SIGNER_URL, SIGNER)
    return SIGNER


def main():
    if not os.path.isfile(SRC_APK):
        sys.exit('Missing ' + SRC_APK)
    if not os.path.isfile(KEYSTORE):
        sys.exit('Missing keystore ' + KEYSTORE)

    shell = []
    with zipfile.ZipFile(SRC_APK, 'r') as zin:
        for info in zin.infolist():
            if info.filename.startswith('META-INF/') or info.filename.startswith('assets/'):
                continue
            data = zin.read(info.filename)
            if info.filename == 'resources.arsc' and b'Ujjain MedStore' in data:
                data = data.replace(b'Ujjain MedStore', b'Akshay Medicose', 1)
            shell.append((info.filename, data, info.compress_type))

    assets = public_files()
    entries = shell + [(name, assets[name], zipfile.ZIP_DEFLATED) for name in sorted(assets)]
    # resources.arsc must stay stored; shell already preserves compress types.

    unsigned = os.path.join(tempfile.gettempdir(), 'akshay-unsigned.apk')
    pack(entries, unsigned)

    with zipfile.ZipFile(unsigned, 'r') as zf:
        info = zf.getinfo('resources.arsc')
        # Local header offset is not exposed; verify the entry exists and is stored.
        if info.compress_type != zipfile.ZIP_STORED:
            sys.exit('resources.arsc must be stored uncompressed')

    signer = ensure_signer()
    out_dir = tempfile.mkdtemp(prefix='akshay-sign-')
    cmd = [
        'java', '-jar', signer,
        '-a', unsigned,
        '--ks', KEYSTORE,
        '--ksAlias', 'ujjainmed',
        '--ksPass', 'ujjain123',
        '--ksKeyPass', 'ujjain123',
        '--allowResign',
        '-o', out_dir
    ]
    subprocess.check_call(cmd)
    signed = None
    for name in os.listdir(out_dir):
        if name.endswith('.apk'):
            signed = os.path.join(out_dir, name)
            break
    if not signed:
        sys.exit('Signer did not produce an APK')

    os.makedirs(os.path.join(PUBLIC, 'download'), exist_ok=True)
    shutil.copy(signed, OUT_APK)
    shutil.copy(signed, os.path.join(PUBLIC, 'download', 'UjjainMedStore-v1.0.apk'))
    print('Signed APK:', OUT_APK, os.path.getsize(OUT_APK), 'bytes')
    subprocess.check_call(['java', '-jar', signer, '-y', '-a', OUT_APK])


if __name__ == '__main__':
    main()
