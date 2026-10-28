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


def bump_manifest(data):
    """Keep the bundled binary manifest at versionCode 3 / versionName 2.1.0."""
    if '2.0.0'.encode('utf-16le') in data:
        data = data.replace('2.0.0'.encode('utf-16le'), '2.1.0'.encode('utf-16le'), 1)
    # versionCode is the INT_DEC attribute immediately after the versionCode name.
    # The manifest start element stores it as type 0x10 and value 2.
    needle = struct.pack('<IIIHBBI', 0, 0, 0xFFFFFFFF, 8, 0, 0x10, 2)
    # Locate via the parsed attribute instead of a brittle needle when possible.
    try:
        import io
        # Walk chunks copied from the known AXML layout used by this shell.
        pos = 8
        stype, hsize, csize = struct.unpack_from('<HHI', data, pos)
        if stype == 1:
            pos = pos + csize
        while pos + 8 <= len(data):
            ctype, hsz, csz = struct.unpack_from('<HHI', data, pos)
            if ctype == 0x0102 and csz >= hsz + 20:
                acount = struct.unpack_from('<H', data, pos + 8 + 16 + 4)[0]
                # attrCount sits after ns, name (8 bytes) + attrStart, attrSize (4) = offset 28 from node start? 
                # node: type/hsize/csize (8) + line, comment, ns, name (16) + attrStart, attrSize, attrCount
                attr_count, = struct.unpack_from('<H', data, pos + 28)
                attr_size, = struct.unpack_from('<H', data, pos + 26)
                ap = pos + hsz
                for _i in range(attr_count):
                    ans, aname, raw, vsize, res0, typ, val = struct.unpack_from('<IIIHBBI', data, ap)
                    if typ == 0x10 and val == 2 and aname == 0:
                        data = data[:ap + 16] + struct.pack('<I', 3) + data[ap + 20:]
                        return data
                    ap += attr_size or 20
            if csz < 8:
                break
            pos += csz
    except Exception:
        pass
    return data


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
            if info.filename == 'AndroidManifest.xml':
                data = bump_manifest(data)
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
