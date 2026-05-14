import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const AUTH = 'Basic ' + Buffer.from('admin:niffler123').toString('base64');

// POST — WHEP signaling (SDP offer → answer)
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const targetPath = resolvedParams.path.join('/');
  const targetUrl = `http://127.0.0.1:8889/dji/${targetPath}`;

  try {
    const body = await req.text();
    const response = await fetch(targetUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': req.headers.get('Content-Type') ?? 'application/sdp',
        'Authorization': AUTH,
      },
      body,
    });

    const headers = new Headers(response.headers);
    return new Response(await response.text(), { status: response.status, headers });
  } catch (error) {
    console.error('WHEP Proxy Error:', error);
    return new Response('Proxy Error', { status: 500 });
  }
}

// GET — passthrough for any MediaMTX HTTP resources on port 8889
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const targetPath = resolvedParams.path.join('/');
  const url = new URL(req.url);
  const targetUrl = `http://127.0.0.1:8889/dji/${targetPath}${url.search}`;

  try {
    const response = await fetch(targetUrl, {
      cache: 'no-store',
      headers: { 'Authorization': AUTH },
    });

    if (!response.ok) {
      return new Response(`Failed to fetch from camera: ${response.status}`, { status: response.status });
    }

    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('transfer-encoding');

    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    console.error('WebRTC Proxy Error:', error);
    return new Response('Proxy Error', { status: 500 });
  }
}
