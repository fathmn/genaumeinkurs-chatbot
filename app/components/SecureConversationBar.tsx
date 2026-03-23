"use client"

import * as React from "react"
import {
  type DisconnectionDetails,
  type Status,
  useConversation,
} from "@elevenlabs/react"
import { ArrowUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

const RECONNECT_BASE_DELAY_MS = 900
const RECONNECT_MAX_DELAY_MS = 12_000
const DEFAULT_USER_ACTIVITY_PING_MS = 25_000
const MIN_USER_ACTIVITY_PING_MS = 5_000
const MAX_USER_ACTIVITY_PING_MS = 120_000

function parseIntervalMs(
  rawValue: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (!rawValue) return fallback
  const value = Number(rawValue)
  if (!Number.isFinite(value)) return fallback
  const rounded = Math.round(value)
  if (rounded < min || rounded > max) return fallback
  return rounded
}

const USER_ACTIVITY_PING_MS = parseIntervalMs(
  process.env.NEXT_PUBLIC_ELEVENLABS_USER_ACTIVITY_PING_MS,
  DEFAULT_USER_ACTIVITY_PING_MS,
  MIN_USER_ACTIVITY_PING_MS,
  MAX_USER_ACTIVITY_PING_MS
)

type ChatSessionConfig =
  | {
      sessionType: "signed"
      signedUrl: string
    }
  | {
      sessionType: "public"
      agentId: string
      branchId?: string
    }

class ChatSessionError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ChatSessionError"
    this.status = status
  }
}

function isChatSessionError(error: unknown): error is ChatSessionError {
  return error instanceof ChatSessionError
}

function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err
  if (typeof err === "string") return new Error(err)
  try {
    return new Error(JSON.stringify(err))
  } catch {
    return new Error(String(err))
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getStringField(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key]
  return typeof value === "string" ? value : null
}

function isAgentTimeoutDisconnect(details: DisconnectionDetails): boolean {
  if (details.reason !== "agent") return false
  const closeReason =
    typeof details.closeReason === "string" ? details.closeReason : ""

  return /timeout|max[_\s-]?duration|time[_\s-]?limit|session_time_limit_exceeded/i.test(
    closeReason
  )
}

async function fetchSessionConfig(signal: AbortSignal): Promise<ChatSessionConfig> {
  const response = await fetch("/api/get-signed-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: "{}",
    cache: "no-store",
    credentials: "same-origin",
    signal,
  })

  const data = (await response.json().catch(() => ({}))) as {
    sessionType?: string
    error?: string
    signedUrl?: string
    agentId?: string
    branchId?: string
  }

  if (!response.ok) {
    throw new ChatSessionError(
      data.error ?? "Failed to start chat session",
      response.status
    )
  }

  if (data.sessionType === "signed" && data.signedUrl) {
    return {
      sessionType: "signed",
      signedUrl: data.signedUrl,
    }
  }

  if (data.sessionType === "public" && data.agentId) {
    return {
      sessionType: "public",
      agentId: data.agentId,
      branchId: data.branchId,
    }
  }

  if (data.signedUrl) {
    return {
      sessionType: "signed",
      signedUrl: data.signedUrl,
    }
  }

  if (data.agentId) {
    return {
      sessionType: "public",
      agentId: data.agentId,
      branchId: data.branchId,
    }
  }

  throw new ChatSessionError(
    "Malformed response from chat service",
    response.status
  )
}

function buildPublicConversationUrl(agentId: string, branchId?: string): string {
  const url = new URL("wss://api.elevenlabs.io/v1/convai/conversation")
  url.searchParams.set("agent_id", agentId)
  if (branchId) {
    url.searchParams.set("branch_id", branchId)
  }
  return url.toString()
}

export interface SecureConversationBarProps {
  userId?: string
  autoStart?: boolean
  className?: string
  placeholder?: string
  onStatusChange?: (status: Status) => void
  onConnect?: (conversationId: string) => void
  onDisconnect?: (details: DisconnectionDetails) => void
  onError?: (error: Error) => void
  onMessage?: (message: { source: "user" | "ai"; message: string }) => void
  onSendMessage?: (message: string) => void
}

export const SecureConversationBar = React.forwardRef<
  HTMLDivElement,
  SecureConversationBarProps
>(
  (
    {
      userId,
      autoStart = true,
      className,
      placeholder = "Schreibe eine Nachricht…",
      onStatusChange,
      onConnect,
      onDisconnect,
      onError,
      onMessage,
      onSendMessage,
    },
    ref
  ) => {
    const [textInput, setTextInput] = React.useState("")

    const didAutoStartRef = React.useRef(false)
    const pendingMessagesRef = React.useRef<string[]>([])
    const reconnectTimeoutRef = React.useRef<number | null>(null)
    const reconnectAttemptRef = React.useRef(0)
    const manualStopRef = React.useRef(false)
    const shouldMaintainSessionRef = React.useRef(false)
    const startSessionRef = React.useRef<() => Promise<void>>(async () => {})
    const sessionStartPromiseRef = React.useRef<Promise<void> | null>(null)
    const signedUrlAbortRef = React.useRef<AbortController | null>(null)

    const clearReconnectTimer = React.useCallback(() => {
      if (reconnectTimeoutRef.current === null) return
      window.clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }, [])

    const scheduleReconnect = React.useCallback(() => {
      if (manualStopRef.current || !shouldMaintainSessionRef.current) return
      if (reconnectTimeoutRef.current !== null) return

      const delay = Math.min(
        RECONNECT_MAX_DELAY_MS,
        RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttemptRef.current
      )
      reconnectAttemptRef.current += 1

      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectTimeoutRef.current = null
        if (manualStopRef.current || !shouldMaintainSessionRef.current) return
        void startSessionRef.current()
      }, delay)
    }, [])

    const conversation = useConversation({
      textOnly: true,
      onConnect: ({ conversationId }) => {
        clearReconnectTimer()
        reconnectAttemptRef.current = 0
        onConnect?.(conversationId)
      },
      onDisconnect: (details) => {
        onDisconnect?.(details)

        if (manualStopRef.current || !shouldMaintainSessionRef.current) return
        if (details.reason === "user") return
        if (details.reason === "agent" && !isAgentTimeoutDisconnect(details)) {
          shouldMaintainSessionRef.current = false
          return
        }

        scheduleReconnect()
      },
      onError: (err) => {
        onError?.(normalizeError(err))
      },
      onMessage: (evt: unknown) => {
        if (!isRecord(evt)) return

        const message = getStringField(evt, "message")
        if (!message) return

        const role = getStringField(evt, "role")
        if (role === "user") {
          onMessage?.({ source: "user", message })
          return
        }
        if (role === "agent") {
          onMessage?.({ source: "ai", message })
          return
        }

        const source = getStringField(evt, "source")
        if (source === "user" || source === "ai") {
          onMessage?.({ source, message })
        }
      },
    })
    const conversationRef = React.useRef(conversation)
    const conversationStatusRef = React.useRef<Status>(conversation.status)

    conversationRef.current = conversation
    conversationStatusRef.current = conversation.status

    React.useEffect(() => {
      onStatusChange?.(conversation.status)
    }, [conversation.status, onStatusChange])

    const startSession = React.useCallback(async () => {
      manualStopRef.current = false
      shouldMaintainSessionRef.current = true
      clearReconnectTimer()

      const status = conversationStatusRef.current
      if (status === "connected" || status === "connecting") {
        return
      }

      if (sessionStartPromiseRef.current) {
        return sessionStartPromiseRef.current
      }

      const startPromise = (async () => {
        signedUrlAbortRef.current?.abort()
        const controller = new AbortController()
        signedUrlAbortRef.current = controller

        try {
          const sessionConfig = await fetchSessionConfig(controller.signal)
          if (controller.signal.aborted) return

          const activeConversation = conversationRef.current
          if (sessionConfig.sessionType === "public") {
            await activeConversation.startSession({
              signedUrl: buildPublicConversationUrl(
                sessionConfig.agentId,
                sessionConfig.branchId
              ),
              connectionType: "websocket",
              userId,
            })
            return
          }

          await activeConversation.startSession({
            signedUrl: sessionConfig.signedUrl,
            connectionType: "websocket",
            userId,
          })
        } catch (err) {
          if (controller.signal.aborted) return

          const error = normalizeError(err)
          onError?.(error)

          const statusCode = isChatSessionError(err) ? err.status : undefined
          if (statusCode === undefined || statusCode === 429 || statusCode >= 500) {
            scheduleReconnect()
          }
        } finally {
          if (signedUrlAbortRef.current === controller) {
            signedUrlAbortRef.current = null
          }
        }
      })().finally(() => {
        if (sessionStartPromiseRef.current === startPromise) {
          sessionStartPromiseRef.current = null
        }
      })

      sessionStartPromiseRef.current = startPromise
      return startPromise
    }, [clearReconnectTimer, onError, scheduleReconnect, userId])

    React.useEffect(() => {
      startSessionRef.current = startSession
    }, [startSession])

    React.useEffect(() => {
      if (!autoStart) return
      if (didAutoStartRef.current) return
      didAutoStartRef.current = true
      shouldMaintainSessionRef.current = true
      void startSession()
    }, [autoStart, startSession])

    const flushPending = React.useCallback(() => {
      if (conversationStatusRef.current !== "connected") return
      if (pendingMessagesRef.current.length === 0) return

      const pending = pendingMessagesRef.current
      pendingMessagesRef.current = []
      const activeConversation = conversationRef.current

      for (const message of pending) {
        activeConversation.sendUserMessage(message)
      }
    }, [])

    React.useEffect(() => {
      flushPending()
    }, [conversation.status, flushPending])

    React.useEffect(() => {
      if (typeof window === "undefined") return

      const tryRestoreConnection = () => {
        if (!shouldMaintainSessionRef.current || manualStopRef.current) return
        const status = conversationStatusRef.current
        const activeConversation = conversationRef.current

        if (status === "disconnected") {
          void startSession()
          return
        }

        if (status === "connected") {
          try {
            activeConversation.sendUserActivity()
          } catch {
            /* noop */
          }
        }
      }

      const handleVisibility = () => {
        if (document.visibilityState === "visible") {
          tryRestoreConnection()
        }
      }

      document.addEventListener("visibilitychange", handleVisibility)
      window.addEventListener("pageshow", tryRestoreConnection)
      window.addEventListener("online", tryRestoreConnection)

      return () => {
        document.removeEventListener("visibilitychange", handleVisibility)
        window.removeEventListener("pageshow", tryRestoreConnection)
        window.removeEventListener("online", tryRestoreConnection)
      }
    }, [startSession])

    React.useEffect(() => {
      if (conversation.status !== "connected") return

      const interval = window.setInterval(() => {
        if (document.visibilityState !== "visible") return

        try {
          conversationRef.current.sendUserActivity()
        } catch {
          /* noop */
        }
      }, USER_ACTIVITY_PING_MS)

      return () => {
        window.clearInterval(interval)
      }
    }, [conversation.status])

    React.useEffect(() => {
      return () => {
        manualStopRef.current = true
        shouldMaintainSessionRef.current = false
        clearReconnectTimer()
        sessionStartPromiseRef.current = null
        signedUrlAbortRef.current?.abort()
      }
    }, [clearReconnectTimer])

    const handleSendText = React.useCallback(() => {
      const messageToSend = textInput.trim()
      if (!messageToSend) return

      setTextInput("")
      onSendMessage?.(messageToSend)

      if (conversationStatusRef.current === "connected") {
        conversationRef.current.sendUserMessage(messageToSend)
        return
      }

      pendingMessagesRef.current.push(messageToSend)
      void startSession()
    }, [onSendMessage, startSession, textInput])

    const handleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault()
          handleSendText()
        }
      },
      [handleSendText]
    )

    const isDisconnecting = conversation.status === "disconnecting"

    return (
      <div ref={ref} className={cn("flex w-full items-end gap-2", className)}>
        <Textarea
          value={textInput}
          onChange={(event) => setTextInput(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            const scrollIntoView = () => {
              const viewport = window.visualViewport
              if (!viewport) return
              const chat = document.getElementById("chat")
              if (!chat) return

              const bottom = chat.getBoundingClientRect().bottom + window.scrollY
              window.scrollTo({
                top: Math.max(0, bottom - viewport.height),
                behavior: "smooth",
              })
            }

            window.setTimeout(scrollIntoView, 400)
            window.visualViewport?.addEventListener("resize", scrollIntoView, {
              once: true,
            })
          }}
          placeholder={placeholder}
          rows={1}
          className={cn(
            "!min-h-11 max-h-40 flex-1 resize-none rounded-2xl border-border/60 bg-background/40 px-4 py-2.5 text-[13px] shadow-none backdrop-blur-md [field-sizing:normal] sm:text-sm",
            "focus-visible:ring-0"
          )}
          disabled={isDisconnecting}
        />

        <Button
          type="button"
          size="icon"
          onClick={handleSendText}
          disabled={!textInput.trim() || isDisconnecting}
          className="h-11 w-11 rounded-2xl"
          aria-label="Send message"
          title="Send"
        >
          <ArrowUpIcon className="size-4" />
        </Button>
      </div>
    )
  }
)

SecureConversationBar.displayName = "SecureConversationBar"
