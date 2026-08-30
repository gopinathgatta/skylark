'use client';

import { FormEvent, useEffect, useRef, useState, type ReactElement } from 'react';
import styles from './page.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  caveats?: string[];
}

interface ChatMeta {
  fromCache?: boolean;
  fetchedAt?: string;
  dealsCount?: number;
  workOrdersCount?: number;
}

const STARTER_QUESTIONS = [
  "How's our renewables pipeline this quarter?",
  'Total open pipeline value?',
  'Work orders: ongoing vs completed?',
];

function renderInline(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>');
}

function formatMessage(text: string) {
  const lines = text.split('\n');
  const elements: ReactElement[] = [];
  let bulletBuffer: ReactElement[] = [];

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    elements.push(
      <ul key={`ul-${elements.length}`} className={styles.messageList}>
        {bulletBuffer}
      </ul>,
    );
    bulletBuffer = [];
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      return;
    }

    const isBullet = /^[-*•]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed);
    const content = renderInline(trimmed.replace(/^[-*•]\s/, '').replace(/^\d+\.\s/, ''));

    if (isBullet) {
      bulletBuffer.push(
        <li key={i} className={styles.bulletItem} dangerouslySetInnerHTML={{ __html: content }} />,
      );
      return;
    }

    flushBullets();
    elements.push(
      <p key={i} className={styles.paragraph} dangerouslySetInnerHTML={{ __html: content }} />,
    );
  });

  flushBullets();
  return elements;
}

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [leadershipLoading, setLeadershipLoading] = useState(false);
  const [meta, setMeta] = useState<ChatMeta | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const showStarters = messages.length === 0 && !loading;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(text: string, refresh = false) {
    if (!text.trim() || loading) return;

    setMessages((prev) => [...prev, { role: 'user', content: text.trim() }]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), refresh, history }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');

      const caveats: string[] = [];
      const dq = data.meta?.dataQuality;
      if (dq) {
        if (dq.dealsWithMissingSector > 0) caveats.push(`${dq.dealsWithMissingSector} deals missing sector`);
        if (dq.dealsWithMissingValue > 0) caveats.push(`${dq.dealsWithMissingValue} deals missing value`);
        if (dq.workOrdersWithMissingAmount > 0) {
          caveats.push(`${dq.workOrdersWithMissingAmount} work orders missing amount`);
        }
      }

      setMeta({
        fromCache: data.meta?.fromCache,
        fetchedAt: data.meta?.fetchedAt,
        dealsCount: data.meta?.dealsCount,
        workOrdersCount: data.meta?.workOrdersCount,
      });

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer as string, caveats: caveats.length ? caveats : undefined },
      ]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Something went wrong';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Sorry, I couldn't fetch an answer: ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function generateLeadershipUpdate() {
    if (leadershipLoading || loading) return;
    setLeadershipLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: 'Prepare a leadership briefing' }]);

    try {
      const res = await fetch('/api/leadership');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');

      setMeta({
        fromCache: data.fromCache,
        fetchedAt: data.fetchedAt,
      });

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.update as string },
      ]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Something went wrong';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Could not generate leadership update: ${msg}` },
      ]);
    } finally {
      setLeadershipLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  const busy = loading || leadershipLoading;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo}>S</div>
          <div>
            <h1>Skylark BI Agent</h1>
            <p>Founder intelligence · Monday.com live data</p>
          </div>
        </div>
        <button
          type="button"
          className={styles.leadershipBtn}
          onClick={() => void generateLeadershipUpdate()}
          disabled={busy}
        >
          {leadershipLoading ? 'Generating…' : 'Leadership briefing'}
        </button>
      </header>

      {meta && (
        <div className={styles.statusBar}>
          <span className={styles.statusDot} data-cached={meta.fromCache ? 'true' : 'false'} />
          {meta.dealsCount != null && (
            <span>{meta.dealsCount} deals · {meta.workOrdersCount} work orders</span>
          )}
          <span className={styles.statusSep}>·</span>
          <span>{meta.fromCache ? 'Cached snapshot' : 'Live from Monday.com'}</span>
        </div>
      )}

      <main className={styles.main}>
        <section className={styles.chat} aria-live="polite">
          {showStarters && (
            <div className={styles.welcome}>
              <h2>What would you like to know?</h2>
              <p>
                Ask about pipeline health, sector performance, revenue, or work order execution.
                Data is pulled dynamically from your Deals and Work Orders boards.
              </p>
              <div className={styles.starters}>
                {STARTER_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className={styles.starterCard}
                    onClick={() => void sendMessage(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={m.role === 'user' ? styles.messageUser : styles.messageAgent}
            >
              <div className={styles.avatar}>{m.role === 'user' ? 'You' : 'AI'}</div>
              <div className={styles.bubble}>
                <div className={styles.messageBody}>
                  {m.role === 'assistant' ? formatMessage(m.content) : (
                    <p className={styles.paragraph}>{m.content}</p>
                  )}
                </div>
                {m.caveats && m.caveats.length > 0 && (
                  <div className={styles.caveats}>
                    Data note: {m.caveats.join(' · ')}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className={styles.messageAgent}>
              <div className={styles.avatar}>AI</div>
              <div className={`${styles.bubble} ${styles.typing}`}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.typingText}>Analyzing Monday.com data…</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </section>

        <form className={styles.composer} onSubmit={onSubmit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a business question…"
            disabled={busy}
            aria-label="Business question"
          />
          <button type="submit" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
