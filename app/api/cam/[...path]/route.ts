import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

// Each cam key (cam1/cam2/cam3) maps to a full stream URL set via env, e.g.
// cam1=http://34.87.165.238:8889/camera1
const CAM_URLS: Record<string, string> = {
  cam1: process.env.cam1 ?? '',
  cam2: process.env.cam2 ?? '',
  cam3: process.env.cam3 ?? '',
};

const AUTH = 'Basic ' + Buffer.from(
  `${process.env.CAM_USER ?? 'admin'}:${process.env.CAM_PASSWORD ?? ''}`
).toString('base64');

function resolveTarget(path: string[]): string | null {
  const [camKey, ...rest] = path;
  const base = CAM_URLS[camKey];
  if (!base) return null;
  return [base, ...rest].join('/');
}

// POST — WHEP signaling (SDP offer → answer)
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const targetUrl = resolveTarget(resolvedParams.path);
  if (!targetUrl) return new Response('Unknown camera', { status: 404 });

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
  const targetUrl = resolveTarget(resolvedParams.path);
  if (!targetUrl) return new Response('Unknown camera', { status: 404 });
  const url = new URL(req.url);

  try {
    const response = await fetch(`${targetUrl}${url.search}`, {
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
