"use client"

import * as React from "react"
import {
  type DisconnectionDetails,
  type Status,
  useConversation,
} from "@elevenlabs/react"
import { ArrowUpIcon, MicIcon, RotateCcwIcon, SquareIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { VoiceButton, type VoiceButtonState } from "@/components/ui/voice-button"

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

function isAgentTimeoutDisconnect(details: DisconnectionDetails): boolean {
  if (details.reason !== "agent") return false
  const closeReason =
    typeof details.closeReason === "string" ? details.closeReason : ""

  return /timeout|max[_\s-]?duration|time[_\s-]?limit|session_time_limit_exceeded/i.test(
    closeReason
  )
}

export interface ConversationBarProps {
  /**
   * ElevenLabs Agent ID to connect to (public agents can connect directly).
   */
  agentId: string

  /**
   * Optional ElevenLabs Branch ID. When set, websocket sessions target this branch.
   */
  branchId?: string

  /**
   * Optional user ID (your customer id) to be attached to the session.
   */
  userId?: string

  /**
   * Start the session automatically on mount.
   * @default true
   */
  autoStart?: boolean

  /**
   * Chat-first: do not touch microphone APIs.
   * @default true
   */
  textOnly?: boolean

  /**
   * Connection type for chat.
   * @default "websocket"
   */
  connectionType?: "websocket" | "webrtc"

  /**
   * Enable optional voice dictation (browser speech recognition).
   * This is separate from ElevenLabs' voice conversations.
   * @default false
   */
  enableVoiceInput?: boolean

  /**
   * Show connect/disconnect control button.
   * @default false
   */
  showConnectionControl?: boolean

  className?: string
  placeholder?: string

  onStatusChange?: (status: Status) => void
  onConnect?: (conversationId: string) => void
  onDisconnect?: (details: DisconnectionDetails) => void
  onError?: (error: Error) => void
  onMessage?: (message: { source: "user" | "ai"; message: string }) => void
  onSendMessage?: (message: string) => void
}

type BrowserSpeechRecognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: unknown) => void) | null
  onend: (() => void) | null
  onerror: ((event: unknown) => void) | null
}

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition

function getSpeechRecognitionCtor(): BrowserSpeechRecognitionCtor | null {
  const w = window as unknown as Record<string, unknown>
  const sr = w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]
  return typeof sr === "function"
    ? (sr as unknown as BrowserSpeechRecognitionCtor)
    : null
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

function getNumberField(obj: Record<string, unknown>, key: string): number | null {
  const value = obj[key]
  return typeof value === "number" ? value : null
}

function getIndex(value: unknown, index: number): unknown {
  if (Array.isArray(value)) return value[index]
  if (isRecord(value)) return value[String(index)]
  return undefined
}

function buildWebSocketConversationUrl(agentId: string, branchId: string): string {
  const url = new URL("wss://api.elevenlabs.io/v1/convai/conversation")
  url.searchParams.set("agent_id", agentId)
  url.searchParams.set("branch_id", branchId)
  return url.toString()
}

export const ConversationBar = React.forwardRef<HTMLDivElement, ConversationBarProps>(
  (
    {
      agentId,
      branchId,
      userId,
      autoStart = true,
      textOnly = true,
      connectionType = "websocket",
      enableVoiceInput = false,
      showConnectionControl = false,
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
    const [voiceState, setVoiceState] = React.useState<VoiceButtonState>("idle")

    const didAutoStartRef = React.useRef(false)
    const pendingMessagesRef = React.useRef<string[]>([])
    const recognitionRef = React.useRef<BrowserSpeechRecognition | null>(null)
    const reconnectTimeoutRef = React.useRef<number | null>(null)
    const reconnectAttemptRef = React.useRef(0)
    const manualStopRef = React.useRef(false)
    const shouldMaintainSessionRef = React.useRef(false)
    const startSessionRef = React.useRef<() => Promise<void>>(async () => {})

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
      textOnly,
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
          // Agent ended the conversation normally — stop maintaining the session
          // so that visibility/pageshow/online events don't start a new one.
          shouldMaintainSessionRef.current = false
          return
        }

        scheduleReconnect()
      },
      onError: (err) => onError?.(normalizeError(err)),
      onMessage: (evt: unknown) => {
        if (!isRecord(evt)) return

        // The SDK calls `onMessage` with a normalized payload:
        // { message: string, role: "user"|"agent", source?: "user"|"ai" }.
        const msg = getStringField(evt, "message")
        if (!msg) return

        const role = getStringField(evt, "role")
        if (role === "user") {
          onMessage?.({ source: "user", message: msg })
          return
        }
        if (role === "agent") {
          onMessage?.({ source: "ai", message: msg })
          return
        }

        // Back-compat: some payloads may still use `source`.
        const src = getStringField(evt, "source")
        if (src === "user" || src === "ai") {
          onMessage?.({ source: src, message: msg })
        }
      },
    })

    React.useEffect(() => {
      onStatusChange?.(conversation.status)
    }, [conversation.status, onStatusChange])

    const startSession = React.useCallback(async () => {
      if (!agentId) return
      manualStopRef.current = false
      shouldMaintainSessionRef.current = true
      clearReconnectTimer()

      if (conversation.status === "connected" || conversation.status === "connecting") {
        return
      }

      try {
        const trimmedBranchId = branchId?.trim()

        if (connectionType === "websocket" && trimmedBranchId) {
          await conversation.startSession({
            signedUrl: buildWebSocketConversationUrl(agentId, trimmedBranchId),
            connectionType: "websocket",
            userId,
          })
          return
        }

        await conversation.startSession({
          agentId,
          connectionType,
          userId,
        })
      } catch (err) {
        onError?.(normalizeError(err))
        scheduleReconnect()
      }
    }, [
      agentId,
      branchId,
      clearReconnectTimer,
      connectionType,
      conversation,
      onError,
      scheduleReconnect,
      userId,
    ])

    React.useEffect(() => {
      startSessionRef.current = startSession
    }, [startSession])

    const endSession = React.useCallback(async () => {
      manualStopRef.current = true
      shouldMaintainSessionRef.current = false
      clearReconnectTimer()
      reconnectAttemptRef.current = 0

      if (conversation.status === "disconnected" || conversation.status === "disconnecting") {
        return
      }

      try {
        await conversation.endSession()
      } catch (err) {
        onError?.(normalizeError(err))
      }
    }, [clearReconnectTimer, conversation, onError])

    React.useEffect(() => {
      return () => {
        manualStopRef.current = true
        shouldMaintainSessionRef.current = false
        clearReconnectTimer()
      }
    }, [clearReconnectTimer])

    React.useEffect(() => {
      if (!autoStart) return
      if (!agentId) return
      if (didAutoStartRef.current) return
      didAutoStartRef.current = true
      shouldMaintainSessionRef.current = true
      void startSession()
    }, [agentId, autoStart, startSession])

    const flushPending = React.useCallback(() => {
      if (conversation.status !== "connected") return
      if (pendingMessagesRef.current.length === 0) return

      const pending = pendingMessagesRef.current
      pendingMessagesRef.current = []
      for (const msg of pending) {
        conversation.sendUserMessage(msg)
      }
    }, [conversation])

    React.useEffect(() => {
      flushPending()
    }, [flushPending, conversation.status])

    React.useEffect(() => {
      if (typeof window === "undefined") return

      const tryRestoreConnection = () => {
        if (!shouldMaintainSessionRef.current || manualStopRef.current) return
        if (conversation.status === "disconnected") {
          void startSession()
          return
        }
        if (conversation.status === "connected") {
          try {
            conversation.sendUserActivity()
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

      const handlePageShow = () => {
        tryRestoreConnection()
      }

      const handleOnline = () => {
        tryRestoreConnection()
      }

      document.addEventListener("visibilitychange", handleVisibility)
      window.addEventListener("pageshow", handlePageShow)
      window.addEventListener("online", handleOnline)

      return () => {
        document.removeEventListener("visibilitychange", handleVisibility)
        window.removeEventListener("pageshow", handlePageShow)
        window.removeEventListener("online", handleOnline)
      }
    }, [conversation, startSession])

    React.useEffect(() => {
      if (conversation.status !== "connected") return

      const interval = window.setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") {
          return
        }
        try {
          conversation.sendUserActivity()
        } catch {
          /* noop */
        }
      }, USER_ACTIVITY_PING_MS)

      return () => {
        window.clearInterval(interval)
      }
    }, [conversation, conversation.status])

    const handleSendText = React.useCallback(() => {
      const messageToSend = textInput.trim()
      if (!messageToSend) return

      setTextInput("")
      onSendMessage?.(messageToSend)

      if (conversation.status === "connected") {
        conversation.sendUserMessage(messageToSend)
        return
      }

      pendingMessagesRef.current.push(messageToSend)
      void startSession()
    }, [conversation, onSendMessage, startSession, textInput])

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          handleSendText()
        }
      },
      [handleSendText]
    )

    const stopDictation = React.useCallback(() => {
      const rec = recognitionRef.current
      if (!rec) return
      setVoiceState("processing")
      rec.stop()
    }, [])

    const startDictation = React.useCallback(() => {
      const Ctor = getSpeechRecognitionCtor()
      if (!Ctor) {
        setVoiceState("error")
        onError?.(
          new Error(
            "Voice input is not supported in this browser (SpeechRecognition missing)."
          )
        )
        return
      }

      // Stop any previous session
      recognitionRef.current?.abort()

      const rec = new Ctor()
      recognitionRef.current = rec

      rec.lang = "de-DE"
      rec.interimResults = true
      rec.continuous = false

      setVoiceState("recording")

      rec.onresult = (event) => {
        // Append final transcripts to the input.
        let finalText = ""
        if (!isRecord(event)) return
        const resultIndex = getNumberField(event, "resultIndex") ?? 0
        const results = (event as Record<string, unknown>)["results"]
        if (!results || typeof results !== "object") return
        const length = isRecord(results) ? getNumberField(results, "length") : null
        if (length === null) return

        for (let i = resultIndex; i < length; i++) {
          const res = getIndex(results, i)
          if (!isRecord(res)) continue
          if (res["isFinal"] !== true) continue

          const alt0 = getIndex(res, 0)
          if (!isRecord(alt0)) continue
          const transcript = getStringField(alt0, "transcript")
          if (transcript) finalText += transcript
        }

        if (finalText.trim()) {
          setTextInput((prev) =>
            prev.trim().length === 0
              ? finalText.trim()
              : `${prev.trim()} ${finalText.trim()}`
          )
          setVoiceState("success")
        }
      }

      rec.onerror = (event) => {
        console.error("[SpeechRecognition] error", event)
        setVoiceState("error")
      }

      rec.onend = () => {
        recognitionRef.current = null
        setVoiceState("idle")
      }

      try {
        rec.start()
      } catch (err) {
        recognitionRef.current = null
        setVoiceState("error")
        onError?.(normalizeError(err))
      }
    }, [onError])

    const toggleDictation = React.useCallback(() => {
      if (voiceState === "recording" || voiceState === "processing") {
        stopDictation()
      } else {
        startDictation()
      }
    }, [startDictation, stopDictation, voiceState])

    const isDisconnecting = conversation.status === "disconnecting"
    const isConnecting = conversation.status === "connecting"
    const isConnected = conversation.status === "connected"

    const statusDotClass = React.useMemo(() => {
      switch (conversation.status) {
        case "connected":
          return "bg-emerald-500"
        case "connecting":
        case "disconnecting":
          return "bg-amber-500"
        default:
          return "bg-zinc-400"
      }
    }, [conversation.status])

    return (
      <div ref={ref} className={cn("flex w-full items-end gap-2", className)}>
        {showConnectionControl && (
          <div className="flex h-11 items-center gap-2 px-1">
            <span className={cn("size-2 rounded-full", statusDotClass)} />
            {isConnected ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                onClick={() => void endSession()}
                disabled={isDisconnecting}
                aria-label="Disconnect"
                title="Disconnect"
              >
                <SquareIcon className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                onClick={() => void startSession()}
                disabled={isConnecting || isDisconnecting}
                aria-label="Reconnect"
                title="Reconnect"
              >
                <RotateCcwIcon className="size-4" />
              </Button>
            )}
          </div>
        )}

        {enableVoiceInput && (
          <VoiceButton
            size="icon"
            variant="outline"
            state={voiceState}
            onPress={toggleDictation}
            icon={<MicIcon className="size-4" />}
            className="h-11 w-11 rounded-2xl"
            aria-label="Voice input"
            disabled={isDisconnecting}
          />
        )}

        <Textarea
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            const adjust = () => {
              const vv = window.visualViewport
              if (!vv) return
              const chat = document.getElementById("chat")
              if (!chat) return
              const chatBottom = chat.getBoundingClientRect().bottom + window.scrollY
              window.scrollTo({ top: Math.max(0, chatBottom - vv.height), behavior: "smooth" })
            }
            setTimeout(adjust, 400)
            window.visualViewport?.addEventListener("resize", adjust, { once: true })
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

ConversationBar.displayName = "ConversationBar"
