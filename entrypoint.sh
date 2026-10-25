#!/bin/sh
/bin/ollama serve &
SERVER_PID=$!
sleep 4
echo "Checking and pulling Gemma 2 (2B)..."
ollama pull gemma2:2b || true
echo "Ollama server running with Gemma 2 ready on Render!"
wait $SERVER_PID
