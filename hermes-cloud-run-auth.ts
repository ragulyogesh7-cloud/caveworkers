import { GoogleAuth } from 'google-auth-library';

export type IdentityTokenProvider = () => Promise<string | undefined>;

/**
 * Creates a lazily initialized Cloud Run identity-token provider. The returned
 * token is sent on X-Serverless-Authorization so the Hermes API bearer remains
 * available to the private runtime application itself.
 */
export function createCloudRunIdentityTokenProvider(audience?: string): IdentityTokenProvider | undefined {
  const normalizedAudience = String(audience || '').trim();
  if (!normalizedAudience) return undefined;
  const auth = new GoogleAuth();
  let clientPromise: Promise<any> | undefined;
  return async () => {
    clientPromise ||= auth.getIdTokenClient(normalizedAudience);
    const client = await clientPromise;
    const headers = await client.getRequestHeaders();
    const authorization = String(headers.Authorization || headers.authorization || '');
    return authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
  };
}
