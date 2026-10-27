#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/apk-build"
mkdir -p "$BUILD_DIR/assets"
rm -rf "$BUILD_DIR/assets/"*
cp -r "$ROOT_DIR/public/"* "$BUILD_DIR/assets/"
rm -rf "$BUILD_DIR/assets/download"
if ! command -v aapt >/dev/null 2>&1 || ! command -v zipalign >/dev/null 2>&1 || ! command -v apksigner >/dev/null 2>&1; then
  echo "Android SDK tools not on PATH. Repacking web assets into the existing signed APK shell."
  exec python3 "$ROOT_DIR/scripts/repack-apk.py"
fi
OUT_APK="$ROOT_DIR/UjjainMedStore-v1.0.apk"

mkdir -p "$BUILD_DIR/res/drawable" "$BUILD_DIR/res/values" "$BUILD_DIR/smali/com/ujjainmedstore/app"

cat << 'XML' > "$BUILD_DIR/res/values/strings.xml"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Akshay Medicose</string>
</resources>
XML

cat << 'XML' > "$BUILD_DIR/AndroidManifest.xml"
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.ujjainmedstore.app"
    android:versionCode="3"
    android:versionName="2.1.0">

    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="34" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:label="@string/app_name"
        android:icon="@drawable/ic_launcher"
        android:usesCleartextTraffic="true"
        android:allowBackup="true"
        android:theme="@android:style/Theme.DeviceDefault.Light.NoActionBar">

        <activity
            android:name="com.ujjainmedstore.app.MainActivity"
            android:label="@string/app_name"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
XML

cat << 'SMALI' > "$BUILD_DIR/smali/com/ujjainmedstore/app/MainActivity.smali"
.class public Lcom/ujjainmedstore/app/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.java"

.field private webView:Landroid/webkit/WebView;

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V
    return-void
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .registers 5
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    new-instance v0, Landroid/webkit/WebView;
    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V
    iput-object v0, p0, Lcom/ujjainmedstore/app/MainActivity;->webView:Landroid/webkit/WebView;

    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v1

    const/4 v2, 0x1
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowContentAccess(Z)V

    new-instance v2, Landroid/webkit/WebViewClient;
    invoke-direct {v2}, Landroid/webkit/WebViewClient;-><init>()V
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    new-instance v2, Landroid/webkit/WebChromeClient;
    invoke-direct {v2}, Landroid/webkit/WebChromeClient;-><init>()V
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V

    invoke-virtual {p0, v0}, Landroid/app/Activity;->setContentView(Landroid/view/View;)V

    const-string v2, "file:///android_asset/index.html"
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    return-void
.end method

.method public onBackPressed()V
    .registers 3
    iget-object v0, p0, Lcom/ujjainmedstore/app/MainActivity;->webView:Landroid/webkit/WebView;
    if-eqz v0, :call_super
    invoke-virtual {v0}, Landroid/webkit/WebView;->canGoBack()Z
    move-result v1
    if-eqz v1, :call_super
    invoke-virtual {v0}, Landroid/webkit/WebView;->goBack()V
    return-void
    :call_super
    invoke-super {p0}, Landroid/app/Activity;->onBackPressed()V
    return-void
.end method
SMALI

# 1. Assemble smali into classes.dex
smali assemble "$BUILD_DIR/smali" -o "$BUILD_DIR/classes.dex"

# 2. Package resources, manifest, and assets with aapt (keep resources.arsc uncompressed for Android 11-16!)
rm -f "$BUILD_DIR/unaligned.apk" "$BUILD_DIR/aligned.apk"
aapt package -f -m \
  -F "$BUILD_DIR/unaligned.apk" \
  -M "$BUILD_DIR/AndroidManifest.xml" \
  -S "$BUILD_DIR/res" \
  -A "$BUILD_DIR/assets" \
  -I /usr/share/android-framework-res/framework-res.apk \
  -0 arsc

# 3. Add classes.dex to the root of the APK
(cd "$BUILD_DIR" && zip -qj "$BUILD_DIR/unaligned.apk" classes.dex)

# 4. Page-align APK with zipalign (-p 4)
zipalign -p -f 4 "$BUILD_DIR/unaligned.apk" "$BUILD_DIR/aligned.apk"

# 5. Generate keystore if not present and sign APK (v1 + v2 + v3 signatures)
KEYSTORE="$BUILD_DIR/release-key.jks"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias ujjainmed \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass ujjain123 \
    -keypass ujjain123 \
    -dname "CN=Ujjain Medical Store, OU=PharmaTech, O=Shri Mahakal Medical, L=Ujjain, ST=MP, C=IN"
fi

apksigner sign \
  --ks "$KEYSTORE" \
  --ks-key-alias ujjainmed \
  --ks-pass pass:ujjain123 \
  --key-pass pass:ujjain123 \
  --min-sdk-version 21 --v1-signing-enabled true \
  --v2-signing-enabled true \
  --v3-signing-enabled true \
  --out "$OUT_APK" \
  "$BUILD_DIR/aligned.apk"

cp "$OUT_APK" "$ROOT_DIR/public/download/UjjainMedStore-v1.0.apk"

echo "=== APK Build & Verification Complete ==="
ls -lh "$OUT_APK"
apksigner verify --verbose "$OUT_APK"
aapt dump badging "$OUT_APK" | head -n 10
