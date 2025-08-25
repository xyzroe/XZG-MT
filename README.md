## XZG Multi-tool Web

A static web app to flash TI CC2538/CC26x2 devices using the browser’s Web Serial API. No native bridge required.

### Requirements

- Node.js 20.18+
- A Chromium-based browser with Web Serial support (Chrome / Edge)

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

Outputs to `dist/`.

### Develop / Preview

```bash
# Build once and watch + serve on http://localhost:5173
npm run dev

# Or just serve the built output (opens a browser tab)
npm run preview
```

### Lint and Type Check

```bash
npm run lint
npm run typecheck
```

### Usage

- After building, open `dist/index.html` in your browser, or use the preview/dev servers above.
- Web Serial requires HTTPS or localhost. Directly opening the file may restrict functionality.

### Features

- Flash TI CC2538/CC26x2 over Web Serial.
- Load firmware from local files or network manifests.
- Backup/erase/restore NVRAM for supported stacks.

### Project Structure

```
src/
   index.html                 # Entry page
   style.css                 # Styles
   flasher.ts                 # UI and app logic
   protocols/                 # BSL + Intel HEX parsers
   transport/                 # Serial (and optional TCP client code if present)
   utils/                     # Helpers
```

### Notes

- This project is web-only. Native WS→TCP bridge scripts were removed.
- You can use any static server to host `dist/` (for example, `npx http-server dist -p 5173 -o`).

### Favicons (automated)

This project uses RealFaviconGenerator CLI to generate and inject favicons during build/watch.

- Master icon: `imgs/logo.svg`
- Settings: `favicon-settings.json`

Scripts:

- `npm run fav:gen` — generate files into `dist/fav` and `dist/favicon-data.json`
- `npm run fav:inject` — inject markup into `dist/index.html`

These run automatically in `npm run build` and `npm run watch`.

. ~/.nvm/nvm.sh
nvm use 20.18
