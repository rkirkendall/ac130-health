FROM mcr.microsoft.com/presidio-analyzer:latest
RUN apt-get update && apt-get install -y netcat-openbsd && rm -rf /var/lib/apt/lists/*
