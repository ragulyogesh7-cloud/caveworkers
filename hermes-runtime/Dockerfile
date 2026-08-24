FROM nousresearch/hermes-agent:latest
COPY hermes-runtime/entrypoint.sh /usr/local/bin/caveworkers-hermes-entrypoint
RUN chmod 0555 /usr/local/bin/caveworkers-hermes-entrypoint
# The entrypoint creates a minimal profile in /opt/data and never invokes the
# Hermes dashboard or CLI. Cloud Run exposes only the authenticated API server.
ENTRYPOINT ["/usr/local/bin/caveworkers-hermes-entrypoint"]
