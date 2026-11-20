#!/bin/bash
set -e
cd /var/app/staging
npm ci --include=dev
npm run build
