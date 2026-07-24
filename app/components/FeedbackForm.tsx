"use client";

import { FormEvent, MouseEvent, useEffect, useRef, useState } from "react";
import posthog from "posthog-js";

type FeedbackFormProps = {
  category: string;
  language: string;
  puzzle: number;
};

export default function FeedbackForm({
  category,
  language,
  puzzle,
}: FeedbackFormProps) {
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(0);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const typeRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    typeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function toggle() {
    setOpen((current) => {
      const next = !current;
      if (next) {
        setOpenedAt(Date.now());
        setStatus("idle");
        setError("");
        posthog.capture("feedback_form_opened", { category, language, puzzle });
      }
      return next;
    });
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) setOpen(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: data.get("type"),
          message: data.get("message"),
          email: data.get("email"),
          website: data.get("website"),
          openedAt,
          context: {
            category,
            language,
            puzzle: String(puzzle),
            viewport: `${window.innerWidth}×${window.innerHeight}`,
          },
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to send feedback.");

      form.reset();
      setStatus("sent");
      posthog.capture("feedback_sent", { category, language, puzzle });
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Unable to send feedback.");
    }
  }

  return (
    <div className={`feedback-wrap ${open ? "open" : ""}`}>
      <button
        aria-expanded={open}
        aria-controls="feedback-panel"
        className="community-link"
        onClick={toggle}
        type="button"
      >
        <span aria-hidden="true">✦</span>
        Send feedback
        <span aria-hidden="true">{open ? "↑" : "↓"}</span>
      </button>
      {open ? (
        <div className="feedback-overlay" onMouseDown={closeFromBackdrop}>
          <form
            aria-labelledby="feedback-title"
            aria-modal="true"
            className="feedback-panel"
            id="feedback-panel"
            onSubmit={submit}
            role="dialog"
          >
            <div className="feedback-heading">
              <div>
                <strong id="feedback-title">Help improve the game</strong>
                <p>Share a suggestion, problem or question.</p>
              </div>
              <button aria-label="Close feedback form" onClick={toggle} type="button">×</button>
            </div>

            {status === "sent" ? (
              <div className="feedback-success" role="status">
                <strong>Thank you!</strong>
                <p>Your feedback was sent.</p>
              </div>
            ) : (
              <>
                <label>
                  What is this about?
                  <select defaultValue="suggestion" name="type" ref={typeRef}>
                    <option value="suggestion">Suggestion</option>
                    <option value="problem">Problem</option>
                    <option value="question">Question</option>
                  </select>
                </label>
                <label>
                  Your message
                  <textarea
                    maxLength={2000}
                    minLength={10}
                    name="message"
                    placeholder="Tell us what happened or what would make the game better…"
                    required
                    rows={4}
                  />
                </label>
                <label>
                  Email <span>(optional, only if you want a reply)</span>
                  <input autoComplete="email" maxLength={254} name="email" type="email" />
                </label>
                <label aria-hidden="true" className="feedback-trap">
                  Website
                  <input autoComplete="off" name="website" tabIndex={-1} />
                </label>
                {status === "error" ? <p className="feedback-error" role="alert">{error}</p> : null}
                <button className="btn-primary feedback-submit" disabled={status === "sending"} type="submit">
                  {status === "sending" ? "Sending…" : "Send feedback"}
                </button>
              </>
            )}
          </form>
        </div>
      ) : null}
    </div>
  );
}
