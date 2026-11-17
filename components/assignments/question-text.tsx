import { questionTextBlocks } from "@/services/assignments/question-text";
/** Render frozen plain text without interpreting imported HTML. */
export function QuestionText({ text }: { text: string }) {
  const blocks = questionTextBlocks(text);
  return (
    <div className="min-w-0 space-y-3 text-sm leading-7">
      {blocks.map((block, index) => {
        return block.heading ? (
          <h3
            key={index}
            className="text-ink pt-5 text-lg leading-7 font-bold first:pt-0"
          >
            {block.text}
          </h3>
        ) : block.code ? (
          <pre
            key={index}
            className="max-w-full overflow-x-auto rounded-lg bg-slate-50 p-3 text-sm whitespace-pre"
          >
            <code>{block.text}</code>
          </pre>
        ) : (
          <p
            key={index}
            className="[overflow-wrap:anywhere] whitespace-pre-wrap"
          >
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
