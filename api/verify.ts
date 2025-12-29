import { kv } from "@vercel/kv";

export const config = {
  runtime: 'edge',
};

async function checkRateLimit(ip: string): Promise<boolean> {
  const key = `ratelimit_verify_${ip}`;
  const count: number = await kv.incr(key);
  if (count === 1) await kv.expire(key, 300); // 5 minute limit window
  return count <= 5; // Very strict for verification
}

async function hashIdentifier(input: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify', 'sign']
  );
  const signedBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const signedArray = Array.from(new Uint8Array(signedBuffer));
  const generatedSignature = signedArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return generatedSignature === signature;
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const ip = req.headers.get('x-forwarded-for') || 'anonymous';
  if (!(await checkRateLimit(ip))) {
    return new Response(JSON.stringify({ error: 'Too many verification attempts' }), { status: 429 });
  }

  try {
    const { identifier, paymentId, orderId, signature, packageType } = await req.json();
    const secret = process.env.RAZORPAY_KEY_SECRET;

    if (secret) {
      const isValid = await verifySignature(`${orderId}|${paymentId}`, signature, secret);
      if (!isValid) return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 403 });
    }

    const hashedId = await hashIdentifier(identifier);
    await kv.set(`paid_v2_${hashedId}`, {
      paymentId,
      packageType,
      verifiedAt: new Date().toISOString(),
      credits: 3
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal Error' }), { status: 500 });
  }
}