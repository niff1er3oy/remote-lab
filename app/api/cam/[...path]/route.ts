import { NextRequest } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const targetPath = resolvedParams.path.join('/');
  
  // MediaMTX HLS runs on port 8888 by default
  const targetUrl = `http://127.0.0.1:8888/dji/${targetPath}`;

  try {
    const response = await fetch(targetUrl);
    
    if (!response.ok) {
      return new Response(`Failed to fetch from camera: ${response.status}`, { status: response.status });
    }

    const headers = new Headers(response.headers);
    // Remove headers that might cause issues when proxying streaming data
    headers.delete('content-encoding');
    headers.delete('transfer-encoding');

    return new Response(response.body, {
      status: response.status,
      headers: headers,
    });
  } catch (error) {
    console.error('HLS Proxy Error:', error);
    return new Response('Proxy Error', { status: 500 });
  }
}
