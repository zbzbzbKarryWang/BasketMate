import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8000'

async function handleProxy(req: NextRequest, pathSegments: string[]) {
  const path = pathSegments.join('/')
  const backendPath = `/api/${path}`
  const url = `${BACKEND_URL}${backendPath}`

  const headers: HeadersInit = {}
  const contentType = req.headers.get('content-type')
  if (contentType) headers['Content-Type'] = contentType

  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined

  try {
    const response = await fetch(url, { 
      method: req.method, 
      headers, 
      body,
      signal: AbortSignal.timeout(120000)
    })
    const resContentType = response.headers.get('content-type') || ''
    if (resContentType.includes('application/json')) {
      const data = await response.json()
      return NextResponse.json(data, { status: response.status })
    }

    const text = await response.text()
    return new NextResponse(text, {
      status: response.status,
      headers: { 'Content-Type': resContentType || 'text/plain' },
    })
  } catch (error) {
    console.error('Proxy error:', error)
    return new NextResponse('Backend connection failed', { status: 502 })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return handleProxy(req, path)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return handleProxy(req, path)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return handleProxy(req, path)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return handleProxy(req, path)
}
