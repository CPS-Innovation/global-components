# Header Hider Extension

## Packaging Instructions

### Method 1: Pack in Edge
1. Open Edge and go to `edge://extensions/`
2. Enable "Developer mode"
3. Click "Pack extension"
4. Browse to the extension directory
5. Leave the private key field empty (first time)
6. Click "Pack extension"

This creates:
- `browser-extension.crx` - The packaged extension
- `browser-extension.pem` - Private key (keep this safe!)

### Method 2: Manual Installation of .crx
Unfortunately, modern Edge (like Chrome) restricts .crx installations for security. Users would need to:
1. Rename `.crx` to `.zip`
2. Extract it
3. Load unpacked in developer mode

### Method 3: Enterprise Deployment
For enterprise deployment, you can:
1. Host the .crx file on a web server
2. Create an update manifest XML
3. Use Group Policy to whitelist and auto-install

Example policy JSON:
```json
{
  "ExtensionInstallForcelist": [
    "YOUR_EXTENSION_ID;https://yourserver.com/update.xml"
  ]
}
```

## Distribution Steps
1. Pack the extension (creates .crx and .pem)
2. Note the extension ID from Edge
3. Share the .crx file
4. Recipients extract and load unpacked

## Important Notes
- Keep the .pem file secure - it's your signing key
- The extension ID is derived from the .pem file
- For updates, use the same .pem file