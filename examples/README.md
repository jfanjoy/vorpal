# Examples

All examples are ESM modules. Run them with:

```bash
node examples/<name>/<name>.js
```

## Calculator

A simple calculator CLI app with autocompletion and aliases.

## Descriptors

Demonstrates Vorpal's title, version, description, and banner descriptors.

## Mode

Interactive REPL mode — type `repl` to enter, `exit` to leave.
Replaces the unmaintained `vorpal-repl` package.

## Prompt

Demonstrates sequential prompt arrays (username + password).
Uses `this.prompt([...])` to chain multiple prompts and merge results.