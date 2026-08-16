import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

function copyDocumentStyles(source: Document, target: Document): void {
  for (const node of Array.from(source.head.children)) {
    if (node.tagName === "STYLE" || (node.tagName === "LINK" && (node as HTMLLinkElement).rel === "stylesheet")) {
      target.head.appendChild(node.cloneNode(true));
    }
  }
}

export function openTimelineWindow(): Window | null {
  const width = Math.max(900, Math.min(1500, Math.round(window.screen.availWidth * 0.82)));
  const height = Math.max(480, Math.min(900, Math.round(window.screen.availHeight * 0.65)));
  const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
  return window.open(
    "",
    "kcs-advanced-timeline",
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no`,
  );
}

export function TimelinePopout({ popup, children, onClosed }: {
  popup: Window;
  children: ReactNode;
  onClosed(): void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (popup.closed) {
      onClosed();
      return;
    }

    const doc = popup.document;
    doc.title = "KRX Cartoon Studio — Расширенный Timeline";
    doc.documentElement.style.width = "100%";
    doc.documentElement.style.height = "100%";
    doc.body.innerHTML = "";
    doc.body.style.margin = "0";
    doc.body.style.width = "100%";
    doc.body.style.height = "100%";
    doc.body.style.overflow = "hidden";
    doc.body.style.background = "#111416";
    doc.body.style.color = "#e9edf0";
    copyDocumentStyles(document, doc);

    const root = doc.createElement("div");
    root.id = "kcs-timeline-popout-root";
    root.style.width = "100%";
    root.style.height = "100%";
    root.style.display = "grid";
    root.style.gridTemplateRows = "auto minmax(0,1fr)";
    doc.body.appendChild(root);

    const header = doc.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 11px;background:#15191c;border-bottom:1px solid #343a3f;font:13px system-ui,sans-serif;";
    header.innerHTML = `<strong>◆ Расширенный Timeline</strong><span style=\"color:#9aa4aa\">Это то же состояние проекта — изменения сразу видны в главном окне</span>`;
    root.appendChild(header);

    const portalHost = doc.createElement("div");
    portalHost.id = "kcs-timeline-popout-portal";
    portalHost.style.minHeight = "0";
    portalHost.style.height = "100%";
    portalHost.style.overflow = "hidden";
    portalHost.style.setProperty("--timeline-height", "100%");
    root.appendChild(portalHost);

    const handleClosed = () => onClosed();
    popup.addEventListener("beforeunload", handleClosed);
    setReady(true);

    return () => {
      popup.removeEventListener("beforeunload", handleClosed);
      setReady(false);
      if (!popup.closed) popup.close();
    };
  }, [onClosed, popup]);

  if (!ready || popup.closed) return null;
  const host = popup.document.getElementById("kcs-timeline-popout-portal");
  return host ? createPortal(children, host) : null;
}
