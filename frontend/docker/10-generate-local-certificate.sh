#!/bin/sh
set -eu

cert_dir=/etc/nginx/certs
cert_file="$cert_dir/localhost.pem"
key_file="$cert_dir/localhost-key.pem"

mkdir -p "$cert_dir"

if [ ! -s "$cert_file" ] || [ ! -s "$key_file" ]; then
    umask 077
    openssl req \
        -x509 \
        -nodes \
        -days 365 \
        -newkey rsa:2048 \
        -keyout "$key_file" \
        -out "$cert_file" \
        -subj "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,DNS:frontend,DNS:host.docker.internal,IP:127.0.0.1"
fi
