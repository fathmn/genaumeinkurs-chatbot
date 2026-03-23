import { NextRequest, NextResponse } from "next/server"

import {
  consumeSignedUrlRateLimit,
  getClientIp,
  isTrustedRequestOrigin,
} from "@/lib/chat-security"

export const dynamic = "force-dynamic"

function json(
  body: Record<string, string | undefined>,
  init: {
    status: number
    headers?: HeadersInit
  }
) {
  return NextResponse.json(body, {
    status: init.status,
    headers: {
      "Cache-Control": "no-store",
      ...init.headers,
    },
  })
}

function getChatConfig() {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim()
  const agentId =
    process.env.ELEVENLABS_AGENT_ID?.trim() ??
    process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID?.trim()
  const branchId =
    process.env.ELEVENLABS_BRANCH_ID?.trim() ??
    process.env.NEXT_PUBLIC_ELEVENLABS_BRANCH_ID?.trim()

  return { apiKey, agentId, branchId }
}

export function GET() {
  return json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST, OPTIONS" } }
  )
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS",
      "Cache-Control": "no-store",
    },
  })
}

export async function POST(request: NextRequest) {
  if (!isTrustedRequestOrigin(request)) {
    return json({ error: "Forbidden" }, { status: 403 })
  }

  const clientIp = getClientIp(request)
  const rateLimit = consumeSignedUrlRateLimit(`signed-url:${clientIp}`)
  if (!rateLimit.allowed) {
    return json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1_000))
          ),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rateLimit.resetAt),
        },
      }
    )
  }

  const { apiKey, agentId, branchId } = getChatConfig()

  if (!agentId) {
    return json(
      { error: "Chat is temporarily unavailable" },
      { status: 503 }
    )
  }

  if (!apiKey) {
    return json(
      {
        sessionType: "public",
        agentId,
        branchId,
      },
      {
        status: 200,
        headers: {
          "X-RateLimit-Remaining": String(rateLimit.remaining),
          "X-RateLimit-Reset": String(rateLimit.resetAt),
        },
      }
    )
  }

  const url = new URL(
    "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url"
  )
  url.searchParams.set("agent_id", agentId)
  if (branchId) url.searchParams.set("branch_id", branchId)

  const res = await fetch(url, {
    headers: {
      "xi-api-key": apiKey,
    },
    cache: "no-store",
  })

  if (!res.ok) {
    return json({ error: "Failed to start chat session" }, { status: 502 })
  }

  const data = (await res.json()) as { signed_url?: string; signedUrl?: string }
  const signedUrl = data.signed_url ?? data.signedUrl

  if (!signedUrl) {
    return json(
      { error: "Chat provider returned an invalid session" },
      { status: 502 }
    )
  }

  return json(
    { sessionType: "signed", signedUrl },
    {
      status: 200,
      headers: {
        "X-RateLimit-Remaining": String(rateLimit.remaining),
        "X-RateLimit-Reset": String(rateLimit.resetAt),
      },
    }
  )
}
