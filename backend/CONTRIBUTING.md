# Contributing

## Development Setup

```bash
git clone <repo>
cd mcp-agenda
npm install
npm run build
```

## Testing

All changes must include tests and maintain a passing suite:

```bash
npm test
npx tsc --noEmit
```

## Commit Guidelines

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new MCP tool or feature
- `fix:` — bug fix
- `test:` — test additions or changes
- `docs:` — documentation
- `refactor:` — code restructuring
- `chore:` — build, config, CI

## Pull Request Process

1. Ensure all tests pass (`npm test`)
2. Ensure TypeScript compiles cleanly (`npx tsc --noEmit`)
3. Update README.md if adding or changing tools
4. Update CHANGELOG.md for user-facing changes

## Code Style

- TypeScript strict mode
- No ESLint/Prettier required — follow existing patterns
- Use `const` over `let`, prefer `async/await`
- Add JSDoc for exported functions when behavior isn't obvious
