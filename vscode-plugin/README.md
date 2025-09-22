# vscode-plugin

This VS Code extension displays the change rate of a stock in the status bar.

## Features

- Displays the stock change rate in the status bar.
- Updates every second.

## Running the Extension

1. Open this project in VS Code.
2. Make sure you have a local server running that provides the stock data at `http://localhost:3000/quote?symbol=sh603256`.
3. Press `F5` to open a new Extension Development Host window with the extension running.
4. The stock change rate will be displayed in the status bar.

## Running Tests

Run `npm test` in the terminal.