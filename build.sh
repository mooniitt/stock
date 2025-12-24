#!/bin/bash
docker stop stock-app || true
docker rm stock-app || true
docker build -t stock-server .
docker run -d -p 3000:3000 --name stock-app stock-server
