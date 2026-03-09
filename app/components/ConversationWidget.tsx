"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react"
import { motion } from "motion/react"
import LiquidGlass from "liquid-glass-react"
import type { Status } from "@elevenlabs/react"
import { useStickToBottomContext, type ScrollToBottom } from "use-stick-to-bottom"

import { cn } from "@/lib/utils"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ui/conversation"
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message"
import { Response } from "@/components/ui/response"
import { ConversationBar } from "@/components/ui/conversation-bar"
import { ShimmeringText } from "@/components/ui/shimmering-text"

const DEFAULT_AGENT_ID = "agent_5501khtmqwn7eect7q4bsatgp4yw"
const DEFAULT_BRANCH_ID = "agtbrch_6501khtmqyd3eqdtkh90wa6crmvt"

type UiMessage = {
  id: string
  from: "user" | "assistant"
  text: string
  createdAt: number
  isStreaming?: boolean
}

function splitAssistantMessage(text: string): string[] {
  return text
    .split("\n\n")
    .map((part) => part.trim())
    .filter(Boolean)
}

function useStableUserId() {
  const key = "elevenlabs_user_id"

  const [userId] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined

    const existing = window.localStorage.getItem(key)
    if (existing) return existing

    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  })

  useEffect(() => {
    if (!userId) return
    if (typeof window === "undefined") return

    const existing = window.localStorage.getItem(key)
    if (!existing) window.localStorage.setItem(key, userId)
  }, [key, userId])

  return userId
}

type StickToBottomApi = {
  scrollToBottom: ScrollToBottom
  isAtBottom: boolean
}

function StickToBottomBridge({
  apiRef,
}: {
  apiRef: MutableRefObject<StickToBottomApi | null>
}) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()

  useEffect(() => {
    apiRef.current = { isAtBottom, scrollToBottom }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, isAtBottom, scrollToBottom])

  return null
}

export function ConversationWidget() {
  const userId = useStableUserId()
  const envAgentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID
  const envBranchId = process.env.NEXT_PUBLIC_ELEVENLABS_BRANCH_ID
  const agentId = envAgentId || DEFAULT_AGENT_ID
  const branchId = envAgentId
    ? envBranchId
    : envBranchId || DEFAULT_BRANCH_ID

  const mouseContainerRef = useRef<HTMLDivElement | null>(null)

  const [status, setStatus] = useState<Status>("disconnected")
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [lastError, setLastError] = useState<string | null>(null)
  const stickApiRef = useRef<StickToBottomApi | null>(null)
  const assistantSeenRef = useRef(false)
  const assistantQueueRef = useRef<Omit<UiMessage, "id">[]>([])
  const streamingRef = useRef<{ id: string; target: string } | null>(null)
  const [streaming, setStreaming] = useState<{ id: string; target: string } | null>(
    null
  )

  const firstAssistantMessageId = useMemo(() => {
    return messages.find((m) => m.from === "assistant")?.id ?? null
  }, [messages])

  const lastLocalUserMessageRef = useRef<{ text: string; ts: number } | null>(
    null
  )

  const addMessage = useCallback((m: Omit<UiMessage, "id">) => {
    if (m.from === "assistant") assistantSeenRef.current = true
    setMessages((prev) => [
      ...prev,
      {
        id: `${m.createdAt}-${Math.random().toString(16).slice(2)}`,
        ...m,
      },
    ])
  }, [])

  const handleSendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const ts = Date.now()
      lastLocalUserMessageRef.current = { text: trimmed, ts }

      addMessage({
        from: "user",
        text: trimmed,
        createdAt: ts,
      })
    },
    [addMessage]
  )

  const handleIncomingMessage = useCallback(
    (msg: { source: "user" | "ai"; message: string }) => {
      const text = msg.message.trim()
      if (!text) return

      const ts = Date.now()

      if (msg.source === "user") {
        const last = lastLocalUserMessageRef.current
        if (last && last.text === text && ts - last.ts < 2_000) {
          // Avoid duplicating the optimistic local message.
          return
        }
        addMessage({ from: "user", text, createdAt: ts })
        return
      }

      const queued = { from: "assistant" as const, text, createdAt: ts }

      // Animate the agent's very first message like a real chat:
      // 1) Insert an empty assistant bubble.
      // 2) Reveal the text progressively (streaming effect).
      if (!assistantSeenRef.current) {
        assistantSeenRef.current = true
        const id = `${ts}-${Math.random().toString(16).slice(2)}`
        setMessages((prev) => [
          ...prev,
          { id, from: "assistant", text: "", createdAt: ts, isStreaming: true },
        ])
        const next = { id, target: text }
        streamingRef.current = next
        setStreaming(next)
        return
      }

      // If we're currently "typing" the first assistant message, queue additional assistant messages.
      if (streamingRef.current) {
        assistantQueueRef.current.push(queued)
        return
      }

      addMessage(queued)
    },
    [addMessage]
  )

  const lastMessage = messages.at(-1) ?? null
  const lastMessageId = lastMessage?.id ?? null
  const lastMessageFrom = lastMessage?.from ?? null
  const lastMessageTextLen = lastMessage?.text.length ?? 0
  const lastMessageStreaming = lastMessage?.isStreaming ?? false

  useEffect(() => {
    const api = stickApiRef.current
    if (!api) return
    if (!lastMessageId || !lastMessageFrom) return

    // If the user sends a message while scrolled up, they should still see it immediately.
    if (lastMessageFrom === "user") {
      // `use-stick-to-bottom` supports the special value "instant" (even though its TS types
      // currently don't include it) which jumps without the spring animation.
      api.scrollToBottom(
        "instant" as unknown as Parameters<ScrollToBottom>[0]
      )
      return
    }

    // Keep the view pinned to the bottom only if the user is already there.
    if (api.isAtBottom) api.scrollToBottom()
  }, [
    lastMessageFrom,
    lastMessageId,
    lastMessageStreaming,
    lastMessageTextLen,
  ])

  useEffect(() => {
    if (!streaming) return

    const { id, target } = streaming
    const total = target.length

    // Make the "first message typing" effect noticeably faster:
    // cap total animation duration and increase chunk sizes for long replies.
    const desiredDurationMs = Math.min(1_650, Math.max(300, 200 + total * 1.45))
    const baseTickMs = 28
    const ticks = Math.max(1, Math.ceil(desiredDurationMs / baseTickMs))
    const step = Math.max(1, Math.ceil(total / ticks))
    const startDelayMs = 105

    let idx = 0
    let timeoutId: number | null = null

    const tick = () => {
      idx = Math.min(total, idx + step)
      const slice = target.slice(0, idx)

      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, text: slice } : m))
      )

      if (idx >= total) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, text: target, isStreaming: false } : m
          )
        )

        streamingRef.current = null
        setStreaming(null)

        const queued = assistantQueueRef.current
        assistantQueueRef.current = []
        for (const item of queued) addMessage(item)
        return
      }

      const lastChar = slice.at(-1) ?? ""
      const punctuationPause =
        step <= 3
          ? lastChar === "\n"
            ? 36
            : ".!?".includes(lastChar)
              ? 72
              : ",;:".includes(lastChar)
                ? 42
                : 0
          : 0

      const nextDelay = baseTickMs + punctuationPause
      timeoutId = window.setTimeout(tick, nextDelay)
    }

    timeoutId = window.setTimeout(tick, startDelayMs)

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [addMessage, streaming])

  const statusLabel = useMemo(() => {
    switch (status) {
      case "connected":
        return "connected"
      case "connecting":
        return "connecting"
      case "disconnected":
        return "disconnected"
      case "disconnecting":
        return "disconnecting"
      default:
        return String(status)
    }
  }, [status])

  return (
    <div
      ref={mouseContainerRef}
      className="relative isolate h-[74dvh] min-h-[500px] w-full overflow-hidden rounded-[32px] shadow-[0_32px_90px_rgba(0,0,0,0.16)] sm:h-[70dvh] sm:min-h-[520px] lg:h-full lg:min-h-[600px]"
    >
      <LiquidGlass
        mouseContainer={mouseContainerRef}
        mode="standard"
        displacementScale={80}
        blurAmount={0.25}
        saturation={155}
        aberrationIntensity={1.6}
        elasticity={0}
        cornerRadius={32}
        overLight={false}
        padding="0px"
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          // liquid-glass-react always applies a translate(-50%) transform internally.
          // Anchoring the component at 50%/50% keeps the effect aligned with our container
          // instead of drifting outside the grid column.
          top: "50%",
          left: "50%",
        }}
        className={cn(
          "h-full w-full",
          // liquid-glass-react renders a Fragment with multiple absolutely-positioned siblings.
          // Its internal `.glass` element is `inline-flex` and size-to-content by default, which
          // breaks containment (the chat can 'float' and scrolling won't work). Force it to fill
          // this widget container.
          "[&_.glass]:!flex [&_.glass]:!h-full [&_.glass]:!w-full [&_.glass]:!flex-col [&_.glass]:!items-stretch [&_.glass]:!gap-0",
          // The library wraps `children` in an extra div; it also must stretch.
          "[&_.glass>div]:h-full [&_.glass>div]:w-full [&_.glass>div]:flex [&_.glass>div]:flex-col"
        )}
      >
        <section
          className="relative flex h-full w-full flex-col text-sm text-foreground [text-shadow:none]"
        >
          {/* Tint layer: LiquidGlass does the refraction; this adds legibility without global CSS overrides. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-white/55"
          />
          <div className="relative flex h-full w-full flex-col">
            <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
              <div className="space-y-0.5">
                <div className="text-sm font-medium leading-5">
                  GenauMeinKurs Chat
                </div>
                <div className="text-muted-foreground text-xs leading-4">
                  Kostenlos · unverbindlich · startet automatisch
                </div>
              </div>
              <StatusPill status={statusLabel} />
            </header>

            <div className="min-h-0 flex-1 px-3 pb-4">
              <div className="bg-background/60 ring-foreground/15 flex h-full flex-col overflow-hidden rounded-[32px] ring-1 backdrop-blur-sm">
                <Conversation className="min-h-0 flex-1">
                  <StickToBottomBridge apiRef={stickApiRef} />
                  <ConversationContent className="space-y-1">
                    {messages.length === 0 ? (
                      <ConversationEmptyState
                        title="Sag hallo"
                        description="Der Chat startet automatisch. Tipp einfach los."
                      />
                    ) : (
                      messages.map((m) => {
                        const isAssistant = m.from === "assistant"
                        const isFirstAssistant =
                          isAssistant && m.id === firstAssistantMessageId
                        const assistantParts =
                          isAssistant && !m.isStreaming
                            ? splitAssistantMessage(m.text)
                            : [m.text]

                        return (
                          <Message key={m.id} from={m.from}>
                            <MessageAvatar
                              name={m.from === "user" ? "DU" : "AI"}
                              src={m.from === "user" ? undefined : "/agent.jpg"}
                            />
                            {isAssistant ? (
                              <motion.div
                                initial={{
                                  opacity: 0,
                                  scale: 0.98,
                                  filter: isFirstAssistant
                                    ? "blur(10px)"
                                    : "blur(6px)",
                                }}
                                animate={{
                                  opacity: 1,
                                  scale: 1,
                                  filter: "blur(0px)",
                                }}
                                transition={
                                  isFirstAssistant
                                    ? {
                                        type: "spring",
                                        stiffness: 320,
                                        damping: 26,
                                        mass: 0.8,
                                      }
                                    : {
                                        duration: 0.18,
                                        ease: [0.22, 1, 0.36, 1],
                                      }
                                }
                                style={{ transformOrigin: "0% 100%" }}
                                className="flex min-w-0 flex-1 will-change-transform"
                              >
                                <div className="flex min-w-0 flex-1 flex-col gap-2">
                                  {m.isStreaming && m.text.length === 0 ? (
                                    <MessageContent className="max-w-[96%] sm:max-w-[92%]">
                                      <div className="py-0.5">
                                        <ShimmeringText
                                          text="Agent tippt…"
                                          duration={1.4}
                                          repeatDelay={0.15}
                                          className="text-sm"
                                        />
                                      </div>
                                    </MessageContent>
                                  ) : (
                                    assistantParts.map((part, index) => (
                                      <MessageContent
                                        key={`${m.id}-${index}`}
                                        className="max-w-[96%] sm:max-w-[92%]"
                                      >
                                        <Response>{part}</Response>
                                        {m.isStreaming && index === assistantParts.length - 1 ? (
                                          <span
                                            aria-hidden="true"
                                            className="ml-1 inline-block h-4 w-1 translate-y-[2px] rounded-full bg-foreground/35 animate-pulse"
                                          />
                                        ) : null}
                                      </MessageContent>
                                    ))
                                  )}
                                </div>
                              </motion.div>
                            ) : (
                              <div className="flex flex-1 min-w-0 justify-end">
                                <MessageContent>
                                  <p className="whitespace-pre-wrap">{m.text}</p>
                                </MessageContent>
                              </div>
                            )}
                          </Message>
                        )
                      })
                    )}
                  </ConversationContent>
                  <ConversationScrollButton />
                </Conversation>

                <div className="border-foreground/10 bg-background/20 border-t px-4 py-4 backdrop-blur-md">
                  <ConversationBar
                    agentId={agentId}
                    branchId={branchId}
                    userId={userId}
                    autoStart
                    textOnly
                    connectionType="websocket"
                    enableVoiceInput={false}
                    showConnectionControl={false}
                    onStatusChange={(s) => setStatus(s)}
                    onMessage={handleIncomingMessage}
                    onSendMessage={handleSendMessage}
                    onError={(err) => setLastError(err.message)}
                  />

                  {lastError && (
                    <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
                      <div className="font-medium">Error</div>
                      <div className="text-muted-foreground break-words">
                        {lastError}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </LiquidGlass>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const classes =
    status === "connected"
      ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
      : status === "connecting" || status === "disconnecting"
        ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
        : "bg-zinc-500/10 text-zinc-800 dark:text-zinc-200"

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
        classes
      )}
      aria-live="polite"
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "connected"
            ? "bg-emerald-500"
            : status === "connecting" || status === "disconnecting"
              ? "bg-amber-500"
              : "bg-zinc-400"
        )}
      />
      <span className="capitalize">{status}</span>
    </div>
  )
}
