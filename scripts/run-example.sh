#!/bin/bash

# Example script to run the page saver via CLI

echo "Running capture for example.com..."
node src/cli.js --url "https://example.com" --screenshot true --pdf true

echo "Running capture with session export..."
node src/cli.js --url "https://news.ycombinator.com" --saveSession true --session hn-session.json

echo "Check the 'outputs' directory for results."
