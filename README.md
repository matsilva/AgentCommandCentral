# Agent Command Central

Various CLI utilities built with Bun.

## Installation

```bash
bun install
```

## Development

```bash
bun dev <command> [options]
```

## Available Commands

### `hello`
Say hello with an optional name.

```bash
bun dev hello --name "Your Name"
```

### `info`
Display system information.

```bash
bun dev info
bun dev info --json  # Output as JSON
```

## Building

To compile to a standalone binary:

```bash
bun build
```

This creates an `acc` executable.

## Project Structure

```
src/
├── index.ts         # Main CLI entry point
├── commands/        # Command implementations
│   ├── hello.ts
│   └── info.ts
└── utils/           # Utility functions
    └── format.ts
```

## Adding New Commands

1. Create a new file in `src/commands/`
2. Export a Commander command
3. Import and add it to `src/index.ts`

## Technologies

- **Bun** - JavaScript runtime & toolkit
- **Commander.js** - CLI framework
- **Chalk** - Terminal string styling
- **TypeScript** - Type safety