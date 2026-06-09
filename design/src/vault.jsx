/* ============================================================
   Vault + AI — Obsidian export setup + AI Foundation
   ============================================================ */

const VAULT_FOLDERS = ['Inbox', 'Daily', 'Weekly', 'Subjects', 'Exams', 'Summaries', 'Templates'];

function buildDailyNote(data) {
  const dateStr = ST.iso(ST.today);
  const todays = data.sessions.filter(s => (s.start || '').slice(0, 10) === dateStr);
  const mins = todays.reduce((a, s) => a + s.minutes, 0);
  let md = `# Daily Note — ${dateStr}\n\n`;
  md += `> Focused **${ST.fmtMins(mins)}** across ${todays.length} session${todays.length !== 1 ? 's' : ''} · ${data.streak}-day streak\n\n`;
  md += `## Sessions\n`;
  if (todays.length === 0) md += `_No sessions logged yet today._\n`;
  todays.forEach(s => {
    const c = ST.courseById(data, s.courseId);
    md += `\n### ${s.goal || s.preset} · ${ST.fmtMins(s.minutes)}\n`;
    md += `- **Course:** ${c ? c.name : 'General'} · **Preset:** ${s.preset} · **Confidence:** ${s.confidence}/5\n`;
    if (s.learned) md += `- **Learned:** ${s.learned}\n`;
    if (s.blocker) md += `- **Blocker:** ${s.blocker}\n`;
    if (s.next) md += `- **Next:** ${s.next}\n`;
  });
  md += `\n## Tomorrow's focus\n`;
  ST.allTasks(data).filter(t => t.done < t.total).sort((a, b) => ST.urgency(b) - ST.urgency(a)).slice(0, 3)
    .forEach(t => { md += `- [ ] ${t.title} _(${t.courseName}, ${ST.taskRemaining(t)} units)_\n`; });
  return md;
}

function MarkdownPreview({ md }) {
  const lines = md.split('\n');
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7, color: 'var(--ink-2)' }}>
      {lines.map((ln, i) => {
        if (ln.startsWith('# ')) return <div key={i} className="serif" style={{ fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 600, color: 'var(--ink)', margin: '0 0 8px' }}>{ln.slice(2)}</div>;
        if (ln.startsWith('### ')) return <div key={i} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: '12px 0 4px' }}>{ln.slice(4)}</div>;
        if (ln.startsWith('## ')) return <div key={i} className="eyebrow" style={{ margin: '14px 0 6px', color: 'var(--accent)' }}>{ln.slice(3)}</div>;
        if (ln.startsWith('> ')) return <div key={i} style={{ borderLeft: '2px solid var(--accent-line)', paddingLeft: 10, color: 'var(--ink-3)', margin: '4px 0' }} dangerouslySetInnerHTML={{ __html: inlineMd(ln.slice(2)) }} />;
        if (ln.startsWith('- ')) return <div key={i} style={{ paddingLeft: 12 }} dangerouslySetInnerHTML={{ __html: '• ' + inlineMd(ln.slice(2)) }} />;
        if (ln.trim() === '') return <div key={i} style={{ height: 8 }} />;
        return <div key={i} dangerouslySetInnerHTML={{ __html: inlineMd(ln) }} />;
      })}
    </div>
  );
}
function inlineMd(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--ink)">$1</strong>')
    .replace(/_(.+?)_/g, '<em style="color:var(--ink-4)">$1</em>')
    .replace(/\[ \]/g, '☐');
}

function VaultAI({ data, dispatch }) {
  const [vaultName, setVaultName] = useState(data.meta.vaultName);
  const [apiKey, setApiKey] = useState(data.meta.apiKey);
  const [model, setModel] = useState(data.meta.model);
  const [history, setHistory] = useState([
    { date: ST.addDays(-1), path: 'Daily/2026-06-08.md', time: ST.addDays(-1) + 'T22:10' },
    { date: ST.addDays(-2), path: 'Daily/2026-06-07.md', time: ST.addDays(-2) + 'T21:48' },
    { date: ST.addDays(-3), path: 'Daily/2026-06-06.md', time: ST.addDays(-3) + 'T23:02' },
  ]);
  const md = buildDailyNote(data);

  const exportToday = () => {
    const dateStr = ST.iso(ST.today);
    setHistory(h => [{ date: dateStr, path: `Daily/${dateStr}.md`, time: dateStr + 'T' + new Date().toTimeString().slice(0, 5) }, ...h.filter(x => x.date !== dateStr)]);
  };

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 className="serif" style={{ fontSize: 27, fontWeight: 500, margin: 0, letterSpacing: '-0.02em' }}>Vault &amp; AI</h1>
        <p style={{ margin: '5px 0 0', fontSize: 13.5, color: 'var(--ink-3)' }}>Turn your sessions into Obsidian notes. Set up AI summaries for later.</p>
      </div>

      <div className="vault-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: 16, alignItems: 'start' }}>
        {/* left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <CardHead eyebrow="Obsidian vault" icon="vault" title="Your study vault" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Vault name"><Input value={vaultName} onChange={e => setVaultName(e.target.value)} /></Field>
              <Field label="Current vault path">
                <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 12.5, background: 'var(--surface-2)' }}>
                  <Icon name="folder" size={14} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />{data.meta.vaultPath}/{vaultName}
                </div>
              </Field>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Btn variant="solid" icon="vault">Create new vault</Btn>
                <Btn variant="primary" icon="download" onClick={exportToday}>Export today's note</Btn>
              </div>
            </div>
            <div style={{ marginTop: 16, padding: '13px 15px', borderRadius: 'var(--r-md)', background: 'var(--surface-inset)', border: '1px solid var(--line-soft)' }}>
              <div className="eyebrow" style={{ marginBottom: 9 }}>Folder structure created</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {VAULT_FOLDERS.map(f => <Chip key={f} size="sm" icon="folder" color="var(--ink-2)">{f}</Chip>)}
              </div>
            </div>
          </Card>

          <Card>
            <CardHead eyebrow="Export history" icon="clock" title="Recent exports" right={<Chip>{history.length}</Chip>} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {history.map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < history.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                  <Icon name="file" size={16} style={{ color: 'var(--ink-4)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{h.date}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{h.path}</div>
                  </div>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{ST.fmtTime(h.time)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead eyebrow="AI Foundation" icon="sparkle" title="Anthropic setup" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Anthropic API key"><Input type="password" value={apiKey} placeholder="sk-ant-…" onChange={e => setApiKey(e.target.value)} /></Field>
              <Field label="Preferred model"><Input value={model} onChange={e => setModel(e.target.value)} /></Field>
            </div>
            <div style={{ marginTop: 14, padding: '13px 15px', borderRadius: 'var(--r-md)', background: 'var(--warn-soft)', border: '1px solid', borderColor: 'color-mix(in oklch, var(--warn) 30%, transparent)', display: 'flex', gap: 10 }}>
              <Icon name="info" size={16} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                <strong>Planned next step.</strong> Real Anthropic summary generation isn't wired up yet. Your key and model are saved locally so summaries can be generated from sessions in a future update.
              </div>
            </div>
          </Card>
        </div>

        {/* right column — markdown preview */}
        <Card style={{ position: 'sticky', top: 0 }}>
          <CardHead eyebrow="Today's daily note" icon="note" title="Markdown preview"
            right={<Btn size="sm" variant="ghost" icon="download" onClick={exportToday}>Export</Btn>} />
          <div style={{ padding: '18px 20px', borderRadius: 'var(--r-md)', background: 'var(--surface-inset)', border: '1px solid var(--line-soft)', maxHeight: 560, overflowY: 'auto' }}>
            <MarkdownPreview md={md} />
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { VAULT_FOLDERS, VaultAI, buildDailyNote });
