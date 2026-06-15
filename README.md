# Graysoft Media Center

Native desktop AI media generation app with embedded CUDA inference. Generate images and video with granular controls for Flux, SDXL, Z-Image Turbo, WAN 2.1, LTX-Video, and more — no separate server required.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/)
- [Python 3.10+](https://www.python.org/) (used at build time for PyO3; runtime packages install on first setup)
- NVIDIA GPU with CUDA support

## First launch

1. Run the app and complete the setup wizard.
2. Verify CUDA is detected.
3. Install Python packages (torch, diffusers, transformers) into app data.
4. Choose output and model weight directories.
5. Download model weights for the models you want to use.

All inference runs in-process inside `graysoft-media-center.exe`. No ComfyUI or localhost HTTP server is required.

## Development

```bash
npm install
npm run tauri dev
```

## Production build

```bash
npm run tauri build
```

The Windows NSIS installer is written to `src-tauri/target/release/bundle/nsis/`.

## Architecture

- **Frontend:** React 19, TypeScript, Tailwind CSS 4, glass UI with light/dark theme
- **Backend:** Tauri 2 (Rust) with SQLite gallery and job queue
- **Inference:** Embedded Python via PyO3, diffusers pipelines on CUDA

```
graysoft-media-center.exe
  ├── React UI (Tauri webview)
  ├── Rust (commands, gallery, jobs)
  └── Embedded Python (torch + diffusers)
        └── Model weights on disk
```

## Storage

| Data | Default location |
|------|------------------|
| Generated media | `%USERPROFILE%\GraysoftMediaCenter\outputs` |
| Model weights | `%APPDATA%\GraysoftMediaCenter\models` |
| Python packages | `%APPDATA%\GraysoftMediaCenter\python-env` |
| Gallery database | `%APPDATA%\GraysoftMediaCenter\gallery.db` |

Paths are configurable in Settings.

## Adding models

1. Add a diffusers pipeline in `src-tauri/python/pipelines/`
2. Register dispatch in `src-tauri/python/pipelines/__init__.py`
3. Create a parameter schema in `src-tauri/schemas/{model-id}.json`
4. Register the model in `src-tauri/schemas/registry.json` and `src-tauri/src/inference/model_manager.rs`

Schema `binding.input` values map to Python pipeline keyword arguments. The UI adapts automatically from the schema.
