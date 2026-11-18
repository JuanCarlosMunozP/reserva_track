# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## Local HTTPS with Docker

The Nginx container generates its own self-signed certificate when it starts.
The certificate and private key stay in a Docker-managed volume; no
certificate tools or certificate files are needed on the host. From the
`backend` directory, start the entire `reserva_track` project, including the
frontend:

```sh
docker compose up --build
```

Open [https://localhost](https://localhost). Since the certificate is
self-signed and its CA is not trusted by the host browser, the browser will
show a certificate warning. This provides HTTPS encryption for local testing,
but is not appropriate for production. Let's Encrypt requires a public domain
that can be validated and cannot issue a certificate for `localhost`. HTTP at
[http://localhost:8081](http://localhost:8081) redirects to HTTPS, using port
8081 because port 80 is already used by another service on this machine.

The frontend is part of the same Compose project as the backend and Flower.
Nginx proxies `/api/`, `/media/`, and `/ws/` to the `web` service over Docker's
internal network. If Django rejects HTTPS form submissions with a CSRF error, add
`CSRF_TRUSTED_ORIGINS=https://localhost` to `backend/.env` and restart the
project. To stop the project, run `docker compose down` from the `backend`
directory.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
