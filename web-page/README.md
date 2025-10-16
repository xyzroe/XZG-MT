# Web Page - Developer Documentation

This directory contains the web frontend for XZG Multi-tool - a TypeScript-based web application for flashing TI CC1352 / CC2652 devices.

## Project Structure

```
web-page/
├── src/                    # Source files
│   ├── flasher.ts         # Main flasher logic
│   ├── cctools.ts         # CC tools implementation
│   ├── netfw.ts           # Network firmware handling
│   ├── index.html         # Main HTML template
│   ├── index.js           # Additional JavaScript
│   ├── style.css          # Styles
│   ├── transport/         # Transport implementations
│   │   ├── serial.ts      # Web Serial API transport
│   │   └── tcp.ts         # TCP/WebSocket transport
│   ├── types/             # TypeScript type definitions
│   │   ├── index.ts       # Main types
│   │   └── web-serial.d.ts # Web Serial API types
│   └── utils/             # Utility functions
│       ├── control.ts     # Control utilities
│       ├── http.ts        # HTTP utilities
│       ├── index.ts       # General utilities
│       └── intelhex.ts    # Intel HEX parser
├── dist/                  # Built files (generated)
├── favicon/               # Favicon source and settings
│   ├── favicon-data.json  # Generated favicon data
│   ├── favicon-settings.json # Favicon generation settings
│   ├── icon.png          # Source icon
│   ├── logo.png          # Logo image
│   └── logo.svg          # Logo vector
├── scripts/               # Build scripts
│   └── inject-commit.js   # Commit hash injection
├── bs-config.js          # Browser-sync configuration
├── package.json          # Node.js dependencies and scripts
├── tsconfig.json         # TypeScript configuration
└── README.md             # This file
```

## Requirements

- Node.js >= 20.18.0
- npm (comes with Node.js)

## Development Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Start development server:**

   ```bash
   npm run dev
   ```

   This will:

   - Build TypeScript files with watch mode
   - Watch HTML/CSS/JS files for changes
   - Generate favicons when settings change
   - Start a local development server with live reload

3. **Access the development server:**
   Open http://localhost:3000 in your browser

## Build Commands

### Full Production Build

```bash
npm run build
```

This creates a complete production build with:

- TypeScript compilation and bundling
- Static file copying
- Commit hash injection
- Favicon generation and injection
- Assets copying to bridge-go/web/

### Lite Build (Development)

```bash
npm run build:lite
```

Creates a minimal build without favicons and commit injection.

### Individual Build Steps

- `npm run clean` - Remove dist directory
- `npm run copy:static` - Copy HTML, CSS, JS files
- `npm run fav:gen` - Generate favicons from logo.svg
- `npm run fav:inject` - Inject favicon tags into HTML
- `npm run inject:commit` - Inject current git commit hash

## Development Workflow

### Making Changes

1. **TypeScript files:** Edit files in `src/` directory
2. **Styles:** Modify `src/style.css`
3. **HTML:** Update `src/index.html`
4. **Types:** Add/modify types in `src/types/`

### Testing Changes

1. The development server automatically reloads on changes
2. Check browser console for TypeScript errors
3. Test with both Web Serial and TCP transport modes

### Code Quality

```bash
# Type checking
npm run typecheck

# Linting
npm run lint
```

## Architecture Overview

### Main Components

- **flasher.ts** - Main application entry point and UI logic
- **cctools.ts** - TI CC device communication protocol
- **transport/** - Abstracted transport layer for serial/TCP communication
- **utils/** - Shared utility functions

### Transport Layer

The application supports two transport modes:

- **Web Serial** (`transport/serial.ts`) - Direct USB connection via Web Serial API
- **TCP/WebSocket** (`transport/tcp.ts`) - Remote connection via bridge

### Build System

- **esbuild** - Fast TypeScript bundler
- **realfavicon** - Favicon generation
- **browser-sync** - Development server with live reload
- **concurrently** - Run multiple build processes

## Deployment

### Static Hosting

The built files in `dist/` can be served by any static web server. The application requires HTTPS for Web Serial API functionality.

### Integration with Bridge

The `npm run copy:ready` command copies built files to `../bridge-go/web/` for embedding in the Go bridge binary.

## Contributing Guidelines

### Code Style

- Follow existing TypeScript conventions
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions focused and small

### Commit Messages

Use conventional commit format:

```
feat: add new firmware upload feature
fix: resolve serial connection timeout
docs: update API documentation
```

### Testing

Before submitting changes:

1. Run `npm run typecheck` - ensure no TypeScript errors
2. Run `npm run lint` - check code style
3. Test functionality in multiple browsers
4. Verify both transport modes work

### Adding New Features

1. Create feature branch from `main`
2. Implement changes with proper typing
3. Update documentation if needed
4. Test thoroughly
5. Submit pull request

## Troubleshooting

### Development Issues

**Build fails with TypeScript errors:**

- Run `npm run typecheck` to see detailed errors
- Ensure all imports have proper type definitions

**Development server not updating:**

- Check if files are being watched correctly
- Restart the dev server: `npm run dev`

**Favicon not updating:**

- Modify `favicon/favicon-settings.json`
- Run `npm run fav:gen && npm run fav:inject`

### Browser Compatibility

- Web Serial API requires Chrome/Edge (not Firefox/Safari)
- HTTPS is required for Web Serial functionality
- Modern ES2020 features are used

### Performance Considerations

- Large firmware files are handled in chunks
- Progress callbacks prevent UI freezing
- Transport layer handles connection timeouts

---

For more information about the overall project, see the [main README](../README.md).
