import { useState } from "react";
import { Button } from "ui-common-components";

// Small reusable copy-to-clipboard button used on Home, Dashboard, and LinkDetail.
export default function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — ignore */
        }
      }}
    >
      {copied ? "Copied!" : label}
    </Button>
  );
}
