# Caveworkers deployment gate



Run the deterministic release gate before every image build:

```bash
npm ci
npm run lint
npm test
npm run build
git diff --check
```

No container image, command line, repository, browser bundle, task prompt, or CI log may contain a production secret. Rotate credentials according to [`SECURITY_ROTATION.md`](SECURITY_ROTATION.md) before the first live release or after any disclosure.
