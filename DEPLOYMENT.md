# Caveworkers deployment gate

Use [`docs/company-production-release.md`](docs/company-production-release.md) as the authoritative release process for the current four-employee Caveworkers application. It supersedes legacy workforce references and documents the public control plane, private Hermes runtime, Cloud Run service boundaries, least-privilege secrets, staged company rollout, and production acceptance gate.

The public service is built from the root [`Dockerfile`](Dockerfile), using [`cloudbuild.caveworkers.yaml`](cloudbuild.caveworkers.yaml), and deployed through [`deploy-caveworkers.sh`](deploy-caveworkers.sh). The private runtime and bridge have independent container and deployment contracts under [`hermes-runtime/`](hermes-runtime/) and [`hermes-bridge/`](hermes-bridge/). Keep `HERMES_ENABLED=false` until the staged Data Analyst smoke test and all runtime checks in the company release guide have passed.

Run the deterministic release gate before every image build:

```bash
npm ci
npm run lint
npm test
npm run build
git diff --check
```

No container image, command line, repository, browser bundle, task prompt, or CI log may contain a production secret. Rotate credentials according to [`SECURITY_ROTATION.md`](SECURITY_ROTATION.md) before the first live release or after any disclosure.
