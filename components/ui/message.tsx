import type { ComponentProps, HTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: "user" | "assistant"
}

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full items-end gap-2 py-3",
      from === "user"
        ? "is-user justify-start flex-row-reverse"
        : "is-assistant justify-start",
      className
    )}
    {...props}
  />
)

const messageContentVariants = cva(
  "is-user:dark flex flex-col gap-2 overflow-hidden break-words rounded-lg text-[13px] sm:text-sm",
  {
    variants: {
      variant: {
        contained: [
          "px-4 py-3 group-[.is-user]:px-5",
          "max-w-[80%]",
          "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground",
          "group-[.is-assistant]:bg-secondary group-[.is-assistant]:text-foreground",
        ],
        flat: [
          "group-[.is-user]:bg-secondary group-[.is-user]:px-5 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
          "group-[.is-user]:max-w-[80%]",
          "group-[.is-assistant]:text-foreground",
        ],
      },
    },
    defaultVariants: {
      variant: "contained",
    },
  }
)

export type MessageContentProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof messageContentVariants>

export const MessageContent = ({
  children,
  className,
  variant,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(messageContentVariants({ variant, className }))}
    {...props}
  >
    {children}
  </div>
)

export type MessageAvatarProps = ComponentProps<typeof Avatar> & {
  src?: string
  name?: string
}

export const MessageAvatar = ({
  src,
  name,
  className,
  ...props
}: MessageAvatarProps) => (
  <Avatar
    className={cn(
      "size-8 border border-foreground/10 bg-background/70",
      className
    )}
    {...props}
  >
    {src ? <AvatarImage alt="" className="mt-0 mb-0" src={src} /> : null}
    <AvatarFallback className="bg-transparent text-[11px] font-semibold tracking-wide text-foreground/70">
      {name?.slice(0, 2)?.toUpperCase() || "ME"}
    </AvatarFallback>
  </Avatar>
)
