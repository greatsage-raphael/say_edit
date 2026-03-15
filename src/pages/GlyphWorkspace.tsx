import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { Viewer, Worker, SpecialZoomLevel } from '@react-pdf-viewer/core';
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation';
import { highlightPlugin } from '@react-pdf-viewer/highlight';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/highlight/lib/styles/index.css';

// ─── AUDIO UTILITIES ────────────────────────────────────────────────────────
const decode = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const createBlob = (data: Float32Array) => {
  const int16 = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) int16[i] = Math.max(-32768, Math.min(32767, data[i] * 32768));
  const uint8 = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
  return { data: btoa(binary), mimeType: 'audio/pcm;rate=16000' };
};
async function decodeAudioData(data: Uint8Array, ctx: AudioContext, rate: number, chan: number) {
  const int16 = new Int16Array(data.buffer);
  const buffer = ctx.createBuffer(chan, int16.length / chan, rate);
  for (let c = 0; c < chan; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) ch[i] = int16[i * chan + c] / 32768.0;
  }
  return buffer;
}

// ─── TYPES ──────────────────────────────────────────────────────────────────
interface ActiveDoc { id: string; url: string; name: string; }

interface HighlightArea {
  height: number;
  left: number;
  pageIndex: number;
  top: number;
  width: number;
}

interface ActiveSection {
  page: number;
  rects: number[][];
  content?: string;
}

interface LogEntry { type: 'system' | 'ai' | 'user' | 'tool' | 'error'; text: string; ts: number; }

// ─── THEME TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg0: '#020202', bg1: '#050505', bg2: '#080808',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(255,255,255,0.10)',
  blue: '#0088ff', green: '#00ff88', red: '#ff4455',
  text: '#e8e8e8', dim: 'rgba(232,232,232,0.30)', dimmer: 'rgba(232,232,232,0.12)',
};

// ─── TRANSCRIPT PANEL ───────────────────────────────────────────────────────
const TranscriptPanel = ({
  fullTranscript, liveChunk, isActive, isSpeaking, activeSection,
}: {
  fullTranscript: string; liveChunk: string; isActive: boolean;
  isSpeaking: boolean; activeSection: ActiveSection | null;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    if (!isActive) return;
    const t = setInterval(() => setCursorOn(c => !c), 530);
    return () => clearInterval(t);
  }, [isActive]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [fullTranscript, liveChunk]);

  const displayed = fullTranscript + liveChunk;

  return (
    <div style={{
      width: '340px', display: 'flex', flexDirection: 'column',
      background: '#061206', borderRight: `1px solid ${C.border}`,
      flexShrink: 0, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,255,136,0.012) 3px,rgba(0,255,136,0.012) 4px)',
      }} />

      <div style={{
        height: '48px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', flexShrink: 0, position: 'relative', zIndex: 1,
        background: 'rgba(0,16,0,0.7)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: isActive && isSpeaking ? C.green : isActive ? 'rgba(0,255,136,0.35)' : 'rgba(255,255,255,0.12)',
            boxShadow: isActive && isSpeaking ? `0 0 10px ${C.green}` : 'none',
            transition: 'all 0.3s',
          }} />
          <span style={{ fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.4em', color: isActive ? 'rgba(0,255,136,0.55)' : 'rgba(255,255,255,0.2)' }}>
            Neural Transcript
          </span>
        </div>
        {isActive && isSpeaking && (
          <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
            {[1,2,3,4,5,6,7,8,9,10].map(i => (
              <div key={i} style={{
                width: '2px', borderRadius: '2px',
                height: `${4 + Math.abs(Math.sin(i * 1.1)) * 14}px`,
                background: C.green, opacity: 0.65,
                animation: `wave ${0.35 + i * 0.07}s ease-in-out infinite alternate`,
              }} />
            ))}
          </div>
        )}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 22px', position: 'relative', zIndex: 1, scrollbarWidth: 'none' }}>
        {!displayed ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
            <div style={{ position: 'relative', width: '64px', height: '64px' }}>
              {[
                { top: 0, left: 0, borderTop: '1px solid rgba(0,255,136,0.18)', borderLeft: '1px solid rgba(0,255,136,0.18)' },
                { top: 0, right: 0, borderTop: '1px solid rgba(0,255,136,0.18)', borderRight: '1px solid rgba(0,255,136,0.18)' },
                { bottom: 0, left: 0, borderBottom: '1px solid rgba(0,255,136,0.18)', borderLeft: '1px solid rgba(0,255,136,0.18)' },
                { bottom: 0, right: 0, borderBottom: '1px solid rgba(0,255,136,0.18)', borderRight: '1px solid rgba(0,255,136,0.18)' },
              ].map((s, i) => <div key={i} style={{ position: 'absolute', width: '18px', height: '18px', ...s }} />)}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', opacity: 0.2 }}>∅</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '10px', fontFamily: 'monospace', letterSpacing: '0.35em', textTransform: 'uppercase', color: 'rgba(0,255,136,0.2)', margin: '0 0 6px' }}>Awaiting Link</p>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.1)', margin: 0 }}>Initialize GLYPH to begin transcription</p>
            </div>
          </div>
        ) : (
          <p style={{ fontFamily: "'Georgia','Times New Roman',serif", fontSize: '15px', lineHeight: '1.9', color: 'rgba(210,255,210,0.82)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {displayed}
            {isActive && (
              <span style={{ display: 'inline-block', width: '2px', height: '1.1em', background: C.green, marginLeft: '3px', verticalAlign: 'text-bottom', opacity: cursorOn ? 1 : 0, transition: 'opacity 0.1s', boxShadow: `0 0 6px ${C.green}` }} />
            )}
          </p>
        )}
      </div>

      {activeSection && (
        <div style={{ margin: '0 12px 12px', padding: '10px 14px', background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: '8px', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: C.green }} />
            <span style={{ fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.3em', color: 'rgba(0,255,136,0.5)' }}>Viewing — Page {activeSection.page}</span>
          </div>
          {activeSection.content && <p style={{ fontSize: '11px', color: 'rgba(0,255,136,0.6)', margin: 0 }}>{activeSection.content}</p>}
        </div>
      )}
    </div>
  );
};

// ─── PROPS ───────────────────────────────────────────────────────────────────
interface GlyphWorkspaceProps {
  initialFile?: File;
  onExit?: () => void;
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
const GlyphWorkspace: React.FC<GlyphWorkspaceProps> = ({ initialFile, onExit }) => {
  const [activeDoc, setActiveDoc] = useState<ActiveDoc | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<'idle'|'uploading'|'ready'|'error'>('idle');
  const [isReindexing, setIsReindexing] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [activeSection, setActiveSection] = useState<ActiveSection | null>(null);

  const [highlights, setHighlights] = useState<HighlightArea[]>([]);

  const [liveChunk, setLiveChunk] = useState('');
  const [fullTranscript, setFullTranscript] = useState('');
  const transcriptAccRef = useRef('');

  const [log, setLog] = useState<LogEntry[]>([
    { type: 'system', text: 'SAY EDIT v1.0 — Awaiting document.', ts: Date.now() }
  ]);

  const sessionRef = useRef<any>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const nextStartRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const connectionReady = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const isMutedRef = useRef(false);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // ── PDF PLUGINS ────────────────────────────────────────────────────────────
  const pageNavPlugin = pageNavigationPlugin();
  const { jumpToPage } = pageNavPlugin;

  const renderHighlights = (props: any) => (
    <div>
      {highlights
        .filter(h => h.pageIndex === props.pageIndex)
        .map((area, idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              top: `${area.top}%`,
              left: `${area.left}%`,
              width: `${area.width}%`,
              height: `${area.height}%`,
              background: 'rgba(255, 235, 0, 0.38)',
              mixBlendMode: 'multiply',
              borderRadius: '2px',
              pointerEvents: 'none',
              animation: 'highlightPulse 2s ease-in-out infinite',
            }}
          />
        ))}
    </div>
  );

  const highlightPluginInstance = highlightPlugin({ renderHighlights });

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [log]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const addLog = useCallback((type: LogEntry['type'], text: string) => {
    setLog(prev => [...prev, { type, text, ts: Date.now() }]);
  }, []);

  // ─── AUTO-UPLOAD initialFile when coming from landing screen ──────────────
  const uploadFileDirectly = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadProgress('uploading');
    addLog('system', `Uploading "${file.name}"...`);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('userId', 'user_123');
    try {
      const res = await fetch('http://localhost:3001/documents/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setActiveDoc({ id: data.id, url: data.file_url, name: data.name });
      setUploadProgress('ready');
      setHighlights([]);
      addLog('system', `"${data.name}" indexed. Ready.`);
      addLog('tool', `Doc ID: ${data.id}`);
    } catch (err: any) {
      setUploadProgress('error');
      addLog('error', `Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  }, [addLog]);

  useEffect(() => {
    if (initialFile) {
      uploadFileDirectly(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  // ─── UPLOAD (manual, via toolbar button) ─────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFileDirectly(file);
    e.target.value = '';
  };

  // ─── REINDEX ─────────────────────────────────────────────────────────────
  const handleReindex = async () => {
    if (!activeDoc || isReindexing) return;
    setIsReindexing(true);
    addLog('system', `Reindexing "${activeDoc.name}" at sentence level...`);
    try {
      const res = await fetch(`http://localhost:3001/documents/reindex/${activeDoc.id}`, { method: 'POST' });
      if (!res.ok) throw new Error(`${res.status}`);
      addLog('system', 'Reindex started in background. Watch server logs for progress.');
      addLog('tool', 'New sentence-level chunks will be ready in ~30-60 seconds.');
      const pollStart = Date.now();
      const poll = setInterval(async () => {
        try {
          const r = await fetch('http://localhost:3001/documents/query', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'overview', userId: 'user_123', documentId: activeDoc.id })
          });
          const chunks = await r.json();
          if (Array.isArray(chunks) && chunks.length > 15) {
            clearInterval(poll);
            setIsReindexing(false);
            addLog('system', `✓ Reindex complete — ${chunks.length} sentence chunks ready.`);
          } else if (Date.now() - pollStart > 120_000) {
            clearInterval(poll);
            setIsReindexing(false);
            addLog('system', 'Reindex still running — check server logs.');
          }
        } catch { /* keep polling */ }
      }, 5000);
    } catch (err: any) {
      addLog('error', `Reindex failed: ${err.message}`);
      setIsReindexing(false);
    }
  };

  const stopGlyph = useCallback(() => {
    addLog('system', 'Neural link terminated.');
    connectionReady.current = false;
    setIsSessionActive(false); setIsSpeaking(false); setLiveChunk('');
    if (sessionRef.current) { try { sessionRef.current.close(); } catch {} sessionRef.current = null; }
    sourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
    sourcesRef.current.clear();
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (inputCtxRef.current) { try { inputCtxRef.current.close(); } catch {} inputCtxRef.current = null; }
    if (outputCtxRef.current) { try { outputCtxRef.current.close(); } catch {} outputCtxRef.current = null; }
  }, [addLog]);

  // ─── INTERRUPT ───────────────────────────────────────────────────────────
  const clearAudioQueue = useCallback(() => {
    sourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
    sourcesRef.current.clear();
    if (outputCtxRef.current) nextStartRef.current = outputCtxRef.current.currentTime;
    setIsSpeaking(false); setLiveChunk('');
  }, []);

  // ─── CONVERT DB BBOX ARRAY → HIGHLIGHT PERCENTAGES ──────────────────────
  const convertRectsToHighlights = useCallback((
    pageIndex: number,
    rects: number[][]
  ): HighlightArea[] => {
    if (!pdfContainerRef.current || !rects?.length) return [];

    const container = pdfContainerRef.current;
    const pageLayer = container.querySelector(
      `[data-testid="core__page-layer-${pageIndex}"]`
    ) as HTMLElement | null;
    if (!pageLayer) return [];

    const canvas = pageLayer.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return [];

    const dpr = window.devicePixelRatio || 1;
    const pageWidthPx = canvas.width / dpr;
    const pageHeightPx = canvas.height / dpr;

    return rects
      .filter(r => r && r.length === 4)
      .map(([bx, by, bw, bh]) => ({
        pageIndex,
        left:   Math.max(0, (bx / pageWidthPx) * 100),
        top:    Math.max(0, (by / pageHeightPx) * 100),
        width:  Math.min(100, (bw / pageWidthPx) * 100),
        height: Math.min(100, (bh / pageHeightPx) * 100),
      }));
  }, []);

  // ─── START ───────────────────────────────────────────────────────────────
  const startGlyph = async () => {
    if (isSessionActive) return stopGlyph();
    if (!activeDoc) { addLog('error', 'No document loaded.'); return; }
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) { addLog('error', 'VITE_GEMINI_API_KEY missing.'); return; }

    addLog('system', 'Fetching document orientation...');
    let docContext = '';
    try {
      const res = await fetch('http://localhost:3001/documents/query', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'document structure headings sections overview introduction conclusion',
          userId: 'user_123',
          documentId: activeDoc.id,
        })
      });
      const chunks = await res.json();
      if (Array.isArray(chunks) && chunks.length > 0) {
        docContext = chunks.map((c: any) =>
          `Page ${c.page_number} | BBox:${JSON.stringify(c.bounding_box)} | ${c.content}`
        ).join('\n');
        addLog('tool', `${chunks.length} orientation chunks loaded.`);
      }
    } catch { addLog('error', 'Could not fetch orientation context.'); }

    const systemInstruction = `You are SAY EDIT, a high-performance AI Document Navigator for lawyers, researchers, and analysts.

DOCUMENT: "${activeDoc.name}"

DOCUMENT ORIENTATION (a few representative sections to give you structure):
${docContext || 'No orientation data — use search_document to explore.'}

WORKFLOW — follow this every time the user asks about content:
1. Call search_document with a precise query to find the relevant sentences and their bboxes.
2. Call focus_document_section with the page and rects from the search results.
3. Answer the user based on what search_document returned.

RULES:
- Never claim content doesn't exist without calling search_document first.
- Always ground your answer in search results — do not hallucinate content.
- Voice-first: keep spoken responses concise (under 30 seconds).
- For multi-sentence answers, pass all relevant rects to focus_document_section at once.`;

    try {
      const ai = new GoogleGenAI({ apiKey });
      inputCtxRef.current = new AudioContext({ sampleRate: 16000 });
      outputCtxRef.current = new AudioContext({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;
      transcriptAccRef.current = '';
      setFullTranscript(''); setLiveChunk(''); setHighlights([]);

      const session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          outputAudioTranscription: {},
          tools: [{
            functionDeclarations: [
              {
                name: 'search_document',
                description: 'Search the document for sentences relevant to a query. Returns the most relevant sentence chunks with their page numbers and bounding boxes. Always call this before answering a specific question about document content.',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    query: {
                      type: Type.STRING,
                      description: 'A precise search query describing the content you are looking for.',
                    }
                  },
                  required: ['query']
                }
              },
              {
                name: 'focus_document_section',
                description: 'Navigate the PDF to a page and apply yellow highlights over the relevant sentences. Call this after search_document, using the exact bboxes from the search results.',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    page: { type: Type.NUMBER, description: '1-indexed page number.' },
                    rects: {
                      type: Type.ARRAY,
                      description: 'Array of bounding boxes from search_document results. Each entry is [x, y, width, height] in PDF points.',
                      items: { type: Type.ARRAY, items: { type: Type.NUMBER } }
                    },
                    section_title: { type: Type.STRING, description: 'Short label shown in the UI.' }
                  },
                  required: ['page', 'rects']
                }
              }
            ]
          }],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
        callbacks: {
          onopen: () => {
            setIsSessionActive(true);
            addLog('system', 'WebSocket open. Stabilizing...');
            setTimeout(() => {
              if (!inputCtxRef.current || !sessionRef.current) return;
              connectionReady.current = true;

              const source = inputCtxRef.current.createMediaStreamSource(stream);
              const proc = inputCtxRef.current.createScriptProcessor(4096, 1, 1);
              source.connect(proc); proc.connect(inputCtxRef.current.destination);
              proc.onaudioprocess = (e) => {
                if (connectionReady.current && sessionRef.current && !isMutedRef.current) {
                  try { sessionRef.current.sendRealtimeInput({ media: createBlob(e.inputBuffer.getChannelData(0)) }); }
                  catch { connectionReady.current = false; stopGlyph(); }
                }
              };

              sessionRef.current.sendClientContent({
                turns: [{ role: 'user', parts: [{ text: `Document loaded: "${activeDoc?.name}". Greet me and confirm spatial awareness.` }] }],
                turnComplete: true
              });
              addLog('system', 'Neural link active.');
            }, 600);
          },

          onmessage: async (m: any) => {
            if (m.serverContent?.interrupted) { clearAudioQueue(); return; }

            if (m.serverContent?.outputTranscription?.text) {
              const chunk = m.serverContent.outputTranscription.text;
              transcriptAccRef.current += chunk;
              setLiveChunk(prev => prev + chunk);
              setFullTranscript(transcriptAccRef.current);
            }
            if (m.serverContent?.turnComplete) { setLiveChunk(''); }

            const audio = m.serverContent?.modelTurn?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
            if (audio && outputCtxRef.current) {
              setIsSpeaking(true);
              try {
                const buf = await decodeAudioData(decode(audio), outputCtxRef.current, 24000, 1);
                const src = outputCtxRef.current.createBufferSource();
                src.buffer = buf;
                src.connect(outputCtxRef.current.destination);
                const now = outputCtxRef.current.currentTime;
                const start = Math.max(now, nextStartRef.current);
                src.start(start);
                nextStartRef.current = start + buf.duration;
                sourcesRef.current.add(src);
                src.onended = () => {
                  sourcesRef.current.delete(src);
                  if (sourcesRef.current.size === 0) setIsSpeaking(false);
                };
              } catch { setIsSpeaking(false); }
            }

            // ── TOOL CALLS ────────────────────────────────────────────────
            if (m.toolCall) {
              for (const fc of m.toolCall.functionCalls) {

                // ── search_document ───────────────────────────────────────
                if (fc.name === 'search_document') {
                  const { query } = fc.args;
                  addLog('tool', `🔍 Searching: "${query}"`);
                  try {
                    const res = await fetch('http://localhost:3001/documents/query', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        query,
                        userId: 'user_123',
                        documentId: activeDoc?.id,
                      }),
                    });
                    const results = await res.json();
                    const formatted = Array.isArray(results) && results.length > 0
                      ? results.map((c: any) =>
                          `Page ${c.page_number} | BBox:${JSON.stringify(c.bounding_box)} | ${c.content}`
                        ).join('\n')
                      : 'No relevant content found for that query.';

                    addLog('tool', `↩ ${results?.length ?? 0} results returned`);
                    sessionRef.current?.sendToolResponse({
                      functionResponses: [{
                        id: fc.id, name: fc.name,
                        response: { results: formatted }
                      }]
                    });
                  } catch (err: any) {
                    addLog('error', `Search failed: ${err.message}`);
                    sessionRef.current?.sendToolResponse({
                      functionResponses: [{
                        id: fc.id, name: fc.name,
                        response: { error: 'Search failed. Try rephrasing the query.' }
                      }]
                    });
                  }
                }

                // ── focus_document_section ────────────────────────────────
                if (fc.name === 'focus_document_section') {
                  const { page, rects, section_title } = fc.args;
                  const pageIndex = page - 1;

                  const normalizedRects: number[][] = (
                    Array.isArray(rects[0]) ? rects : [rects]
                  );

                  jumpToPage(pageIndex);

                  const applyHighlights = () => {
                    const areas = convertRectsToHighlights(pageIndex, normalizedRects);
                    if (areas.length > 0) {
                      setHighlights(areas);
                      addLog('tool', `✦ Page ${page}${section_title ? ` — ${section_title}` : ''} (${areas.length} highlight${areas.length > 1 ? 's' : ''})`);
                    }
                    return areas.length > 0;
                  };

                  setTimeout(() => {
                    if (!applyHighlights()) {
                      setTimeout(applyHighlights, 600);
                    }
                  }, 350);

                  setActiveSection({ page, rects: normalizedRects, content: section_title });

                  sessionRef.current?.sendToolResponse({
                    functionResponses: [{ id: fc.id, name: fc.name, response: { result: 'navigated', page, rects: normalizedRects } }]
                  });
                }
              }
            }
          },

          onclose: (e: any) => { addLog('error', `Closed: ${e.code} — ${e.reason || 'no reason'}`); stopGlyph(); },
          onerror: (e: any) => { addLog('error', `Error: ${e.message}`); stopGlyph(); }
        }
      });

      sessionRef.current = session;
    } catch (err: any) { addLog('error', `Init failed: ${err.message}`); stopGlyph(); }
  };

  const logColors: Record<LogEntry['type'], string> = {
    system: 'rgba(255,255,255,0.25)', ai: 'rgba(255,255,255,0.7)',
    user: 'rgba(0,136,255,0.75)', tool: 'rgba(0,255,136,0.65)', error: 'rgba(255,68,85,0.75)',
  };
  const logLabels: Record<LogEntry['type'], string> = {
    system: 'SYS', ai: 'SAY_EDIT', user: 'YOU', tool: 'TOOL', error: 'ERR',
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', height: '100vh', width: '100vw',
      background: C.bg0, color: C.text, overflow: 'hidden',
      fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
    }}>

      {/* ── ICON SIDEBAR ────────────────────────────────────────────── */}
      <div style={{ width: '56px', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: '12px', background: C.bg1, borderRight: `1px solid ${C.border}`, flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg,#0088ff,#0044cc)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(0,136,255,0.35)', position: 'relative' }}>
          <span style={{ color: 'white', fontSize: '15px', fontWeight: 700 }}>G</span>
          <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', borderRadius: '50%', background: C.green, border: `2px solid ${C.bg0}` }} />
        </div>

        <div style={{ width: '24px', height: '1px', background: C.border, margin: '4px 0' }} />

        {/* Back to landing */}
        {onExit && (
          <div
            onClick={onExit}
            title="Back to file selection"
            style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '14px', color: C.dim }}
          >←</div>
        )}

        {/* PDF icon */}
        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(0,136,255,0.1)', border: '1px solid rgba(0,136,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '15px' }}>📄</div>

        {/* Power / stop */}
        <div style={{ marginTop: 'auto' }}>
          <div onClick={stopGlyph} style={{ width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', color: 'rgba(255,68,85,0.4)' }}>⏻</div>
        </div>
      </div>

      {/* ── PDF CANVAS ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#000', borderRight: `1px solid ${C.border}`, minWidth: 0 }}>

        {/* Toolbar */}
        <div style={{ height: '48px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: '10px', background: 'rgba(8,8,8,0.95)', flexShrink: 0, zIndex: 20 }}>

          {/* Upload button — always shown so user can swap docs */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 12px', borderRadius: '6px', cursor: isUploading ? 'not-allowed' : 'pointer', background: isUploading ? 'rgba(255,255,255,0.03)' : 'rgba(0,136,255,0.1)', border: `1px solid ${isUploading ? C.border : 'rgba(0,136,255,0.3)'}`, color: isUploading ? C.dim : C.blue, fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
            <span>{isUploading ? '⟳' : '↑'}</span>
            {isUploading ? 'Indexing...' : 'Load PDF'}
            <input type="file" style={{ display: 'none' }} onChange={handleUpload} accept=".pdf" disabled={isUploading} />
          </label>

          {/* Active doc badge */}
          {activeDoc && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '4px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: '6px' }}>
              <span style={{ color: uploadProgress === 'ready' ? C.green : uploadProgress === 'error' ? C.red : C.blue, fontSize: '11px' }}>
                {uploadProgress === 'ready' ? '✓' : uploadProgress === 'error' ? '✗' : '…'}
              </span>
              <span style={{ fontSize: '10px', color: C.dim, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeDoc.name}</span>
            </div>
          )}

          {/* Reindex button */}
          {activeDoc && !isSessionActive && (
            <button
              onClick={handleReindex}
              disabled={isReindexing}
              title="Re-index this document at sentence level for precise highlighting"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '5px 12px', borderRadius: '6px',
                cursor: isReindexing ? 'not-allowed' : 'pointer',
                background: isReindexing ? 'rgba(255,255,255,0.02)' : 'rgba(0,255,136,0.08)',
                border: `1px solid ${isReindexing ? C.border : 'rgba(0,255,136,0.25)'}`,
                color: isReindexing ? C.dim : C.green,
                fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.15em',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: '11px' }}>{isReindexing ? '⟳' : '⟲'}</span>
              {isReindexing ? 'Reindexing...' : 'Reindex'}
            </button>
          )}

          {/* Status pill */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 12px', borderRadius: '20px', border: `1px solid ${isSessionActive ? isSpeaking ? 'rgba(0,255,136,0.4)' : 'rgba(0,136,255,0.4)' : C.border}`, background: isSessionActive ? isSpeaking ? 'rgba(0,255,136,0.05)' : 'rgba(0,136,255,0.05)' : 'transparent', transition: 'all 0.4s' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isSessionActive ? isSpeaking ? C.green : C.blue : 'rgba(255,255,255,0.18)', boxShadow: isSessionActive && isSpeaking ? `0 0 8px ${C.green}` : 'none' }} />
            <span style={{ fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.2em', color: isSessionActive ? isSpeaking ? C.green : C.blue : C.dim }}>
              {isSessionActive ? isSpeaking ? 'AI Speaking' : 'Listening' : 'Offline'}
            </span>
          </div>
        </div>

        {/* PDF area */}
        <div ref={pdfContainerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {activeDoc ? (
            <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js">
              <Viewer
                fileUrl={activeDoc.url}
                plugins={[pageNavPlugin, highlightPluginInstance]}
                defaultScale={SpecialZoomLevel.PageWidth}
              />
            </Worker>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '14px', border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.01)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', opacity: 0.25 }}>📄</div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '10px', fontFamily: 'monospace', letterSpacing: '0.4em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.13)', margin: '0 0 6px' }}>No Document</p>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.07)', margin: 0 }}>Upload a PDF to begin</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── TRANSCRIPT PANEL ────────────────────────────────────────── */}
      <TranscriptPanel
        fullTranscript={fullTranscript}
        liveChunk={liveChunk}
        isActive={isSessionActive}
        isSpeaking={isSpeaking}
        activeSection={activeSection}
      />

      {/* ── INTELLIGENCE DRAWER ─────────────────────────────────────── */}
      <div style={{ width: '300px', display: 'flex', flexDirection: 'column', background: C.bg1, flexShrink: 0 }}>
        <div style={{ height: '48px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', flexShrink: 0 }}>
          <span style={{ fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.4em', color: 'rgba(0,136,255,0.55)' }}>System Log</span>
          <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} style={{ width: '2px', borderRadius: '2px', height: isSessionActive && isSpeaking ? `${4 + Math.abs(Math.sin(i*0.9))*14}px` : '3px', background: isSessionActive && isSpeaking ? C.green : isSessionActive ? 'rgba(0,136,255,0.4)' : 'rgba(255,255,255,0.1)', transition: 'height 0.15s, background 0.3s' }} />
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', scrollbarWidth: 'none' }}>
          {log.map((entry, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', padding: '3px 0' }}>
              <span style={{ fontSize: '8px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', color: logColors[entry.type], opacity: 0.6, flexShrink: 0, width: '34px', marginTop: '2px' }}>{logLabels[entry.type]}</span>
              <span style={{ fontSize: '12px', lineHeight: 1.65, color: logColors[entry.type], fontWeight: 300 }}>{entry.text}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        {/* Spatial anchor */}
        {activeSection && (
          <div style={{ margin: '0 12px 10px', padding: '9px 13px', background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.14)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span style={{ fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(0,255,136,0.45)' }}>Spatial Anchor</span>
              <button onClick={() => { setActiveSection(null); setHighlights([]); }} style={{ background: 'none', border: 'none', color: 'rgba(0,255,136,0.3)', cursor: 'pointer', fontSize: '14px', padding: 0 }}>×</button>
            </div>
            <p style={{ fontSize: '11px', color: 'rgba(0,255,136,0.55)', margin: 0 }}>
              Page {activeSection.page}{activeSection.content ? ` — ${activeSection.content}` : ''}
              {activeSection.rects?.length > 1 && (
                <span style={{ color: 'rgba(0,255,136,0.35)', marginLeft: '6px' }}>({activeSection.rects.length} regions)</span>
              )}
            </p>
          </div>
        )}

        {/* Controls */}
        <div style={{ padding: '14px', borderTop: `1px solid ${C.border}`, background: C.bg0, display: 'flex', flexDirection: 'column', gap: '9px' }}>
          {isSessionActive && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setIsMuted(m => !m)} style={{ flex: 1, padding: '7px 0', borderRadius: '7px', cursor: 'pointer', background: isMuted ? 'rgba(255,68,85,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isMuted ? 'rgba(255,68,85,0.3)' : C.border}`, color: isMuted ? C.red : C.dim, fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {isMuted ? '🔇 Muted' : '🎙 Live'}
              </button>
              <button onClick={clearAudioQueue} style={{ flex: 1, padding: '7px 0', borderRadius: '7px', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.dim, fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                ⏹ Interrupt
              </button>
            </div>
          )}
          <button
            onClick={startGlyph}
            disabled={isUploading}
            style={{ width: '100%', padding: '15px', borderRadius: '9px', cursor: isUploading ? 'not-allowed' : 'pointer', background: isSessionActive ? 'rgba(255,68,85,0.08)' : activeDoc ? 'rgba(0,136,255,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isSessionActive ? 'rgba(255,68,85,0.4)' : activeDoc ? 'rgba(0,136,255,0.4)' : C.border}`, color: isSessionActive ? C.red : activeDoc ? C.blue : C.dim, fontSize: '11px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.25em', transition: 'all 0.2s' }}
          >
            {isSessionActive ? '⏻  Terminate Link' : activeDoc ? '▶  Initialize SAY_EDIT' : '—  Load Document First'}
          </button>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;700&display=swap');
        * { box-sizing: border-box; }
        body, html { margin: 0; padding: 0; height: 100%; }
        ::-webkit-scrollbar { display: none; }
        .rpv-core__viewer { background: #000 !important; }
        .rpv-core__page-layer { background: #000 !important; }
        canvas { filter: invert(0.9) hue-rotate(180deg) brightness(1.05) contrast(1.05); background: #000 !important; }
        @keyframes wave { from { transform:scaleY(0.35); } to { transform:scaleY(1); } }
        @keyframes highlightPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};

export default GlyphWorkspace;