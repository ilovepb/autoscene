import type { UIMessage } from "ai";
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

const TOOL_TITLE_MAP: Record<string, string> = {
  "tool-load_skills": "Load skills",
  "tool-generate_3d_points": "Generate 3D",
  "tool-remove_layer": "Remove layer",
  "tool-clear_all_layers": "Clear all layers",
};

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
                return (
                  <MessageResponse key={`${msg.id}-text-${i}`}>
                    {part.text}
                  </MessageResponse>
                );
              }
              if (part.type === "tool-load_skills") {
                const skills =
                  (part.input as Record<string, string[]>)?.skills ?? [];
                return (
                  <Tool key={`${msg.id}-tool-${i}`}>
                    <ToolHeader
                      title={TOOL_TITLE_MAP[part.type] ?? part.type}
                      state={part.state}
                      type={part.type}
                    />
                    <ToolContent>
                      <div className="px-3 pb-3 text-xs text-muted-foreground">
                        Loaded{" "}
                        <span className="font-semibold">
                          {skills.join(", ")}
                        </span>
                      </div>
                    </ToolContent>
                  </Tool>
                );
              }
              if (part.type === "tool-generate_3d_points") {
                return (
                  <Tool key={`${msg.id}-tool-${i}`}>
                    <ToolHeader
                      title={TOOL_TITLE_MAP[part.type] ?? part.type}
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
              if (
                part.type === "tool-remove_layer" ||
                part.type === "tool-clear_all_layers"
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
