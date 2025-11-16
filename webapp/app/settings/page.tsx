 "use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const config = `{
  "mcpServers": {
    "health-record-mcp": {
      "url": "http://localhost:3002",
      "transport": {
        "type": "sse",
        "url": "http://localhost:3002"
      }
    }
  }
}`;

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied to clipboard");
      setTimeout(() => setMessage(null), 2000);
    } catch (error) {
      console.error("Failed to copy", error);
      setMessage("Unable to copy to clipboard");
      setTimeout(() => setMessage(null), 2000);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure MCP clients to connect to your local AC130 Health server.
            </p>
          </div>
          <Button variant="ghost" onClick={() => router.push("/")}>
            Back to records
          </Button>
        </div>

        {message ? (
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 md:grid-cols-1">
          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="space-y-1">
              <label className="text-sm font-medium">MCP Client Configuration</label>
              <textarea
                readOnly
                value={config}
                className="h-32 w-full rounded-md border border-border bg-muted p-3 font-mono text-xs text-foreground"
              />
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => copy(config)}>
                  Copy configuration
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Paste this block into Cursor or Claude Desktop. The server runs on port 3002 by default.
              Make sure your AC130 Health MCP server is running before connecting.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
