import type { UIMessage } from "ai";
import { useAtomValue } from "jotai";
import { ImageIcon } from "lucide-react";
import { imageTo3dProgressAtom } from "@/atoms/imageTo3dProgress";
import { CodeBlock } from "@/components/ai-elements/code-block";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import { Progress } from "@/components/ui/progress";
import { getImage } from "@/lib/imageStore";

const IMAGE_UPLOAD_RE =
  /\n?\[Image uploaded: "([^"]+)" \(id: ([a-f0-9-]+)\)\]/g;

interface ParsedAttachment {
  filename: string;
  imageId: string;
}

function parseImageAttachments(text: string): {
  cleanText: string;
  attachments: ParsedAttachment[];
} {
  const attachments: ParsedAttachment[] = [];
  const cleanText = text.replace(IMAGE_UPLOAD_RE, (_, filename, imageId) => {
    attachments.push({ filename, imageId });
    return "";
  });
  return { cleanText: cleanText.trim(), attachments };
}

function MessageAttachments({
  attachments,
}: {
  attachments: ParsedAttachment[];
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-1">
      {attachments.map((att) => {
        const entry = getImage(att.imageId);
        const src = entry?.image.src;
        return (
          <div
            key={att.imageId}
            className="relative size-16 rounded-md overflow-hidden border border-border bg-muted shrink-0"
          >
            {src ? (
              <img
                src={src}
                alt={att.filename}
                className="size-full object-cover"
              />
            ) : (
              <div className="size-full flex items-center justify-center">
                <ImageIcon className="size-5 text-muted-foreground" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const TOOL_TITLE_MAP: Record<string, string> = {
  "tool-remove_layer": "remove_layer",
  "tool-clear_all_layers": "clear_all_layers",
  "tool-delete_points_in_region": "delete_points_in_region",
  "tool-delete_points_in_sphere": "delete_points_in_sphere",
  "tool-toggle_original_cloud": "toggle_original_cloud",
  "tool-image_to_3d": "image_to_3d",
};

function ImageTo3dProgress() {
  const step = useAtomValue(imageTo3dProgressAtom);
  if (step.status === "idle") return null;

  const labels: Record<string, string> = {
    "loading-model": "Loading depth model...",
    "estimating-depth": "Estimating depth...",
    "building-cloud": "Building point cloud...",
  };

  return (
    <div className="px-3 pb-3 space-y-1.5">
      <p className="text-xs text-muted-foreground">{labels[step.status]}</p>
      {step.status === "loading-model" && (
        <Progress value={step.progress} className="h-1.5" />
      )}
    </div>
  );
}

export function ChatMessages({ messages }: { messages: UIMessage[] }) {
  return (
    <>
      {messages.map((msg) => (
        <Message key={msg.id} from={msg.role}>
          <MessageContent>
            {msg.parts.map((part, i) => {
              if (part.type === "reasoning") {
                return (
                  <Reasoning
                    key={`${msg.id}-reasoning-${i}`}
                    isStreaming={part.state === "streaming"}
                  >
                    <ReasoningTrigger />
                    <ReasoningContent>{part.text}</ReasoningContent>
                  </Reasoning>
                );
              }
              if (part.type === "text") {
                if (msg.role === "user") {
                  const { cleanText, attachments } = parseImageAttachments(
                    part.text,
                  );
                  return (
                    <div key={`${msg.id}-text-${i}`}>
                      {attachments.length > 0 && (
                        <MessageAttachments attachments={attachments} />
                      )}
                      {cleanText && (
                        <MessageResponse>{cleanText}</MessageResponse>
                      )}
                    </div>
                  );
                }
                return (
                  <MessageResponse key={`${msg.id}-text-${i}`}>
                    {part.text}
                  </MessageResponse>
                );
              }
              if (part.type === "tool-generate_3d_points") {
                return (
                  <Tool key={`${msg.id}-tool-${i}`}>
                    <ToolHeader
                      title="generate_3d_points"
                      state={part.state}
                      type={part.type}
                    />
                    <ToolContent>
                      {(part.input as Record<string, string>)?.code && (
                        <div className="px-3 pb-3">
                          <CodeBlock
                            code={(part.input as Record<string, string>).code}
                            language="javascript"
                          />
                        </div>
                      )}
                      {part.state === "output-available" && (
                        <div className="px-3 pb-3 text-xs text-green-600">
                          {String(part.output)}
                        </div>
                      )}
                      {part.state === "output-error" && (
                        <div className="px-3 pb-3 text-xs text-red-600">
                          {part.errorText}
                        </div>
                      )}
                    </ToolContent>
                  </Tool>
                );
              }
              if (part.type === "tool-image_to_3d") {
                return (
                  <Tool key={`${msg.id}-tool-${i}`} defaultOpen>
                    <ToolHeader
                      title="image_to_3d"
                      state={part.state}
                      type={part.type}
                    />
                    <ToolContent>
                      {part.state === "input-available" && (
                        <ImageTo3dProgress />
                      )}
                      {part.state === "output-available" && (
                        <div className="px-3 pb-3 text-xs text-green-600">
                          {String(part.output)}
                        </div>
                      )}
                      {part.state === "output-error" && (
                        <div className="px-3 pb-3 text-xs text-red-600">
                          {part.errorText}
                        </div>
                      )}
                    </ToolContent>
                  </Tool>
                );
              }
              if (
                part.type === "tool-remove_layer" ||
                part.type === "tool-clear_all_layers" ||
                part.type === "tool-delete_points_in_region" ||
                part.type === "tool-delete_points_in_sphere" ||
                part.type === "tool-toggle_original_cloud"
              ) {
                const title = TOOL_TITLE_MAP[part.type] ?? part.type;
                return (
                  <Tool key={`${msg.id}-tool-${i}`}>
                    <ToolHeader
                      title={title}
                      state={part.state}
                      type={part.type}
                    />
                    <ToolContent>
                      {part.state === "output-available" && (
                        <div className="px-3 pb-3 text-xs text-green-600">
                          {String(part.output)}
                        </div>
                      )}
                      {part.state === "output-error" && (
                        <div className="px-3 pb-3 text-xs text-red-600">
                          {part.errorText}
                        </div>
                      )}
                    </ToolContent>
                  </Tool>
                );
              }
              return null;
            })}
          </MessageContent>
        </Message>
      ))}
    </>
  );
}
