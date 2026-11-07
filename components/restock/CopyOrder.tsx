"use client";

// Copies the suggested order as plain text, ready to paste into a message to the supplier.
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toaster";

export function CopyOrder({ text }: { text: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast({ text: "Order list copied. Paste it in your message to the supplier.", icon: "check" });
    } catch {
      toast({ text: "Couldn't copy. Long-press the list and copy it instead.", icon: "alert" });
    }
  }
  return (
    <button type="button" className="btn btn--secondary" onClick={copy}>
      <Icon name="copy" />
      Copy order list
    </button>
  );
}
