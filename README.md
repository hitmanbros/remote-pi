# remote-pi

Connect to pi sessions running on a PC from an Android phone over Tailscale. List sessions, start new ones in any folder, and replicate pi's TUI features remotely.

## Architecture

- **Bridge** — Node.js WebSocket+REST bridge that lists sessions, browses the filesystem, and forwards `pi --mode rpc`
- **Android App** — React Native (Expo) app with session list, folder picker, and a full chat UI supporting markdown tables, bash syntax highlighting, thinking blocks, tool execution cards, and token cost display

## Bridge Setup

```bash
cd bridge
npm install
npm run build
PI_REMOTE_TOKEN=xxx npm start
```

The bridge listens on port `8765` by default (override with `PORT`). Set `PI_REMOTE_TOKEN` to authenticate clients.

## App Setup

```bash
cd app
npm install
npx expo start
```

Scan the QR code with the Expo Go app on your Android device, or press `a` to launch on an emulator.

## Tailscale Connection

Both your PC (running the bridge) and your Android phone must be on the same Tailscale network. Use the Tailscale IP or MagicDNS name when connecting the app to the bridge.

## CI/CD

An APK is automatically built on every push to `main` via GitHub Actions. Find the artifact named `remote-pi-apk` in the workflow run.
