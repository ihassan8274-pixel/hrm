function b64urlToBuf(s: string): ArrayBuffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function webauthnSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

export async function registerPlatformBiometric(opts: {
  challenge: string;
  rpId: string;
  rpName: string;
  userId: string;
  userName: string;
  userDisplayName: string;
}): Promise<{ credentialId: string; clientDataJSON: string; attestationObject: string }> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: b64urlToBuf(opts.challenge),
      rp: { id: opts.rpId, name: opts.rpName },
      user: {
        id: b64urlToBuf(opts.userId),
        name: opts.userName,
        displayName: opts.userDisplayName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      timeout: 60000,
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'required',
        requireResidentKey: true,
      },
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('لم يتم إنشاء البصمة');
  const resp = cred.response as AuthenticatorAttestationResponse;
  return {
    credentialId: bufToB64url(cred.rawId),
    clientDataJSON: bufToB64url(resp.clientDataJSON),
    attestationObject: bufToB64url(resp.attestationObject),
  };
}

export async function assertPlatformBiometric(opts: {
  challenge: string;
  rpId: string;
  allowCredentialIds?: string[];
}): Promise<{ credentialId: string; clientDataJSON: string; authenticatorData: string; signature: string; userHandle: string | null }> {
  const allow = (opts.allowCredentialIds || []).map((id) => ({
    type: 'public-key' as const,
    id: b64urlToBuf(id),
    transports: ['internal' as AuthenticatorTransport],
  }));
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: b64urlToBuf(opts.challenge),
      rpId: opts.rpId,
      timeout: 60000,
      userVerification: 'required',
      allowCredentials: allow.length ? allow : undefined,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('لم يتم التحقق من البصمة');
  const resp = cred.response as AuthenticatorAssertionResponse;
  return {
    credentialId: bufToB64url(cred.rawId),
    clientDataJSON: bufToB64url(resp.clientDataJSON),
    authenticatorData: bufToB64url(resp.authenticatorData),
    signature: bufToB64url(resp.signature),
    userHandle: resp.userHandle ? bufToB64url(resp.userHandle) : null,
  };
}
