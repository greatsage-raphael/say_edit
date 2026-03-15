import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';

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

// ─── IMAGE UTILITIES ─────────────────────────────────────────────────────────
const fileToBase64 = (file: File): Promise<string> =>
    new Promise((res, rej) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => res((reader.result as string).split(',')[1]);
        reader.onerror = rej;
    });

const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, { type: mime });
};

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface Hotspot { x: number; y: number; displayX: number; displayY: number; }
interface LogEntry { type: 'system' | 'ai' | 'user' | 'tool' | 'error'; text: string; ts: number; }
type WorkspaceMode = 'edit' | 'compose';

// ─── THEME ───────────────────────────────────────────────────────────────────
const C = {
    bg0: '#020202', bg1: '#050505',
    border: 'rgba(255,255,255,0.06)', border2: 'rgba(255,255,255,0.10)',
    blue: '#0088ff', green: '#00ff88', amber: '#ffaa00', red: '#ff4455',
    purple: '#aa44ff',
    text: '#e8e8e8', dim: 'rgba(232,232,232,0.30)', dimmer: 'rgba(232,232,232,0.12)',
};

// ─── TRANSCRIPT PANEL ────────────────────────────────────────────────────────
const TranscriptPanel = ({
    fullTranscript, liveChunk, isActive, isSpeaking, hotspot, mode,
}: {
    fullTranscript: string; liveChunk: string; isActive: boolean;
    isSpeaking: boolean; hotspot: Hotspot | null; mode: WorkspaceMode;
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [cursorOn, setCursorOn] = useState(true);
    const accentRgb = mode === 'compose' ? '170,68,255' : '255,170,0';
    const accent = mode === 'compose' ? C.purple : C.amber;

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
            background: '#060606', borderRight: `1px solid ${C.border}`,
            flexShrink: 0, position: 'relative', overflow: 'hidden',
        }}>
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
                backgroundImage: `repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(${accentRgb},0.010) 3px,rgba(${accentRgb},0.010) 4px)`,
                transition: 'background-image 0.3s',
            }} />

            <div style={{ height: '48px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', flexShrink: 0, position: 'relative', zIndex: 1, background: 'rgba(0,0,0,0.7)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isActive && isSpeaking ? accent : isActive ? `rgba(${accentRgb},0.35)` : 'rgba(255,255,255,0.12)', boxShadow: isActive && isSpeaking ? `0 0 10px ${accent}` : 'none', transition: 'all 0.3s' }} />
                    <span style={{ fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.4em', color: isActive ? `rgba(${accentRgb},0.55)` : 'rgba(255,255,255,0.2)' }}>Neural Transcript</span>
                </div>
                {isActive && isSpeaking && (
                    <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                            <div key={i} style={{ width: '2px', borderRadius: '2px', height: `${4 + Math.abs(Math.sin(i * 1.1)) * 14}px`, background: accent, opacity: 0.65, animation: `wave ${0.35 + i * 0.07}s ease-in-out infinite alternate` }} />
                        ))}
                    </div>
                )}
            </div>

            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 22px', position: 'relative', zIndex: 1, scrollbarWidth: 'none' }}>
                {!displayed ? (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
                        <div style={{ position: 'relative', width: '64px', height: '64px' }}>
                            {[
                                { top: 0, left: 0, borderTop: `1px solid rgba(${accentRgb},0.18)`, borderLeft: `1px solid rgba(${accentRgb},0.18)` },
                                { top: 0, right: 0, borderTop: `1px solid rgba(${accentRgb},0.18)`, borderRight: `1px solid rgba(${accentRgb},0.18)` },
                                { bottom: 0, left: 0, borderBottom: `1px solid rgba(${accentRgb},0.18)`, borderLeft: `1px solid rgba(${accentRgb},0.18)` },
                                { bottom: 0, right: 0, borderBottom: `1px solid rgba(${accentRgb},0.18)`, borderRight: `1px solid rgba(${accentRgb},0.18)` },
                            ].map((s, i) => <div key={i} style={{ position: 'absolute', width: '18px', height: '18px', ...s }} />)}
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', opacity: 0.2 }}>{mode === 'compose' ? '⬡' : '✦'}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: '10px', fontFamily: 'monospace', letterSpacing: '0.35em', textTransform: 'uppercase', color: `rgba(${accentRgb},0.2)`, margin: '0 0 6px' }}>Awaiting Link</p>
                            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.1)', margin: 0 }}>Initialize GLYPH to begin session</p>
                        </div>
                    </div>
                ) : (
                    <p style={{ fontFamily: "'Georgia','Times New Roman',serif", fontSize: '15px', lineHeight: '1.9', color: mode === 'compose' ? 'rgba(220,200,255,0.82)' : 'rgba(255,240,200,0.82)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {displayed}
                        {isActive && (
                            <span style={{ display: 'inline-block', width: '2px', height: '1.1em', background: accent, marginLeft: '3px', verticalAlign: 'text-bottom', opacity: cursorOn ? 1 : 0, transition: 'opacity 0.1s', boxShadow: `0 0 6px ${accent}` }} />
                        )}
                    </p>
                )}
            </div>

            {hotspot && mode === 'edit' && (
                <div style={{ margin: '0 12px 12px', padding: '10px 14px', background: `rgba(${accentRgb},0.04)`, border: `1px solid rgba(${accentRgb},0.15)`, borderRadius: '8px', position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: accent }} />
                        <span style={{ fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.3em', color: `rgba(${accentRgb},0.5)` }}>Edit Region Selected</span>
                    </div>
                    <p style={{ fontSize: '11px', color: `rgba(${accentRgb},0.6)`, margin: 0 }}>({hotspot.x}, {hotspot.y}) px — speak to edit</p>
                </div>
            )}
        </div>
    );
};

// ─── COMPOSE PANEL ───────────────────────────────────────────────────────────
interface ComposePanelProps {
    imageA: File; imageB: File | null;
    imageAUrl: string | null; imageBUrl: string | null;
    onDropB: (file: File) => void; onRemoveB: () => void;
    compositePrompt: string; onPromptChange: (v: string) => void;
    onCompose: () => void; isComposing: boolean;
}

const ComposePanel: React.FC<ComposePanelProps> = ({
    imageA, imageB, imageAUrl, imageBUrl, onDropB, onRemoveB,
    compositePrompt, onPromptChange, onCompose, isComposing,
}) => {
    const [draggingB, setDraggingB] = useState(false);
    const inputBRef = useRef<HTMLInputElement>(null);
    const ready = !!imageB && !!compositePrompt.trim() && !isComposing;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '14px' }}>
            <p style={{ fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.3em', color: 'rgba(170,68,255,0.5)', margin: 0 }}>Composite Studio</p>

            {/* Two image slots */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>

                {/* Slot A — current image, read-only */}
                <div style={{ position: 'relative', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(170,68,255,0.3)', background: '#0a0a0a' }}>
                    <div style={{ position: 'absolute', top: '6px', left: '6px', fontSize: '8px', fontFamily: 'monospace', letterSpacing: '0.1em', color: 'rgba(170,68,255,0.8)', background: 'rgba(0,0,0,0.75)', padding: '2px 6px', borderRadius: '4px', zIndex: 2 }}>A — Source</div>
                    {imageAUrl
                        ? <img src={imageAUrl} alt="A" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', opacity: 0.2 }}>🖼️</div>
                    }
                    <div style={{ position: 'absolute', bottom: '5px', left: '5px', right: '5px', fontSize: '8px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imageA.name}</div>
                </div>

                {/* Slot B — drag/click to add */}
                <div
                    onClick={() => !imageB && inputBRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDraggingB(true); }}
                    onDragLeave={() => setDraggingB(false)}
                    onDrop={e => { e.preventDefault(); setDraggingB(false); const f = e.dataTransfer.files?.[0]; if (f?.type.startsWith('image/')) onDropB(f); }}
                    style={{ position: 'relative', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${draggingB ? 'rgba(170,68,255,0.7)' : imageB ? 'rgba(170,68,255,0.3)' : 'rgba(170,68,255,0.15)'}`, background: draggingB ? 'rgba(170,68,255,0.06)' : '#0a0a0a', cursor: imageB ? 'default' : 'pointer', transition: 'all 0.2s' }}
                >
                    <input ref={inputBRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onDropB(f); e.target.value = ''; }} />
                    <div style={{ position: 'absolute', top: '6px', left: '6px', fontSize: '8px', fontFamily: 'monospace', letterSpacing: '0.1em', color: 'rgba(170,68,255,0.8)', background: 'rgba(0,0,0,0.75)', padding: '2px 6px', borderRadius: '4px', zIndex: 2 }}>B — Target</div>
                    {imageB && imageBUrl ? (
                        <>
                            <img src={imageBUrl} alt="B" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button onClick={e => { e.stopPropagation(); onRemoveB(); }} style={{ position: 'absolute', top: '4px', right: '4px', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,68,85,0.5)', color: C.red, fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3, padding: 0, lineHeight: 1 }}>×</button>
                            <div style={{ position: 'absolute', bottom: '5px', left: '5px', right: '5px', fontSize: '8px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imageB.name}</div>
                        </>
                    ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '22px', color: 'rgba(170,68,255,0.2)' }}>+</span>
                            <span style={{ fontSize: '8px', color: 'rgba(170,68,255,0.3)', fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{draggingB ? 'Drop here' : 'Add Image B'}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Arrow */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ flex: 1, height: '1px', background: 'rgba(170,68,255,0.12)' }} />
                <span style={{ fontSize: '10px', color: 'rgba(170,68,255,0.35)', fontFamily: 'monospace' }}>⬡ combine</span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(170,68,255,0.12)' }} />
            </div>

            {/* Prompt textarea */}
            <textarea
                value={compositePrompt}
                onChange={e => onPromptChange(e.target.value)}
                placeholder={imageB
                    ? 'Describe the composite...\n\nExamples:\n• "Person from A wearing outfit from B"\n• "Product from A on background from B"\n• "Fashion editorial combining both images"'
                    : 'Add Image B first, then describe the composite you want...'}
                rows={5}
                style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border2}`, borderRadius: '8px', padding: '10px 12px', color: C.text, fontSize: '11px', fontFamily: 'monospace', outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }}
            />

            {/* Quick prompt chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {['Wear outfit from B', 'Product on background B', 'Fashion editorial', 'Creative collage', 'Studio portrait'].map(q => (
                    <button key={q} onClick={() => onPromptChange(q)} style={{ padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '9px', background: compositePrompt === q ? 'rgba(170,68,255,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${compositePrompt === q ? 'rgba(170,68,255,0.4)' : C.border}`, color: compositePrompt === q ? C.purple : C.dim, fontFamily: 'monospace', letterSpacing: '0.05em', transition: 'all 0.15s' }}>
                        {q}
                    </button>
                ))}
            </div>

            {/* Generate button */}
            <button
                onClick={onCompose}
                disabled={!ready}
                style={{ width: '100%', padding: '13px', borderRadius: '8px', cursor: ready ? 'pointer' : 'not-allowed', background: ready ? 'rgba(170,68,255,0.12)' : 'rgba(255,255,255,0.02)', border: `1px solid ${ready ? 'rgba(170,68,255,0.45)' : C.border}`, color: ready ? C.purple : C.dim, fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.2em', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
                {isComposing ? (
                    <><div style={{ width: '10px', height: '10px', border: `1px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Compositing...</>
                ) : '⬡ Generate Composite'}
            </button>

            {/* Usage note */}
            <p style={{ fontSize: '9px', color: C.dimmer, fontFamily: 'monospace', margin: 0, lineHeight: 1.6 }}>
                The composite result is added to the edit history. Switch to Edit mode to refine it further with voice commands.
            </p>
        </div>
    );
};

// ─── PROPS ───────────────────────────────────────────────────────────────────
interface GlyphImageWorkspaceProps {
    initialFile: File;
    onExit: () => void;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
const GlyphImageWorkspace: React.FC<GlyphImageWorkspaceProps> = ({ initialFile, onExit }) => {

    // ── Mode ─────────────────────────────────────────────────────────────────
    const [mode, setMode] = useState<WorkspaceMode>('edit');

    // ── Image history ────────────────────────────────────────────────────────
    const [history, setHistory] = useState<File[]>([initialFile]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [isComparing, setIsComparing] = useState(false);

    const currentImage = history[historyIndex];
    const originalImage = history[0];

    const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
    const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);

    useEffect(() => {
        const url = URL.createObjectURL(currentImage);
        setCurrentImageUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [currentImage]);

    useEffect(() => {
        const url = URL.createObjectURL(originalImage);
        setOriginalImageUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [originalImage]);

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;

    // Stale-closure-safe refs
    const historyRef = useRef<File[]>([initialFile]);
    const historyIndexRef = useRef<number>(0);
    historyRef.current = history;
    historyIndexRef.current = historyIndex;

    const addImageToHistory = useCallback((newFile: File) => {
        const liveHistory = historyRef.current;
        const liveIndex = historyIndexRef.current;
        const newHistory = liveHistory.slice(0, liveIndex + 1);
        newHistory.push(newFile);
        historyRef.current = newHistory;
        historyIndexRef.current = newHistory.length - 1;
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    }, []);

    // ── Image B (composite slot) ─────────────────────────────────────────────
    const [imageBFile, setImageBFile] = useState<File | null>(null);
    const [imageBUrl, setImageBUrl] = useState<string | null>(null);
    const [compositePrompt, setCompositePrompt] = useState('');
    const [isComposing, setIsComposing] = useState(false);
    const imageBRef = useRef<File | null>(null);
    imageBRef.current = imageBFile;

    useEffect(() => {
        if (!imageBFile) { setImageBUrl(null); return; }
        const url = URL.createObjectURL(imageBFile);
        setImageBUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [imageBFile]);

    // ── Log ──────────────────────────────────────────────────────────────────
    const [log, setLog] = useState<LogEntry[]>([
        { type: 'system', text: `SAY EDIT Image Mode — "${initialFile.name}" loaded.`, ts: Date.now() },
        { type: 'system', text: 'Edit: click region → speak.  Compose: add Image B via ⬡ tab.', ts: Date.now() },
    ]);
    const logEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [log]);

    const addLog = useCallback((type: LogEntry['type'], text: string) => {
        setLog(prev => [...prev, { type, text, ts: Date.now() }]);
    }, []);

    // ── Composite logic ──────────────────────────────────────────────────────
    const runCompose = useCallback(async (prompt: string, imgA: File, imgB: File): Promise<string> => {
        setIsComposing(true);
        addLog('tool', `⬡ Compositing: "${prompt}"`);
        try {
            const [base64A, base64B] = await Promise.all([fileToBase64(imgA), fileToBase64(imgB)]);
            const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

            const response = await ai.models.generateContent({
                model: 'gemini-3.1-flash-image-preview',
                contents: [
                    { inlineData: { mimeType: imgA.type || 'image/png', data: base64A } },
                    { inlineData: { mimeType: imgB.type || 'image/png', data: base64B } },
                    {
                        text: `You are an expert photo compositor AI. Combine the two images as instructed.

Image A (source): "${imgA.name}"
Image B (target/context): "${imgB.name}"

Composition Request: "${prompt}"

Guidelines:
- Produce a single realistic, high-quality output image.
- Match lighting, shadows, and perspective between the two sources.
- The result should look natural and professionally composed.
- Do not add watermarks, borders, or text overlays.

Output: Return ONLY the final composed image. Do not return any text.`,
                    },
                ],
                config: {
                    responseModalities: ['IMAGE', 'TEXT']
                }
            });

            const imagePart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
            if (!imagePart?.inlineData) {
                const text = response.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text;
                throw new Error(text || 'Model did not return a composite image.');
            }
            const { mimeType: outMime, data: outData } = imagePart.inlineData;
            const compositeFile = dataURLtoFile(`data:${outMime};base64,${outData}`, `composite-${Date.now()}.png`);
            addImageToHistory(compositeFile);
            addLog('tool', '✓ Composite generated — added to history. Switching to Edit mode.');
            setMode('edit'); // show the result
            return 'success';
        } catch (err: any) {
            addLog('error', `Composite failed: ${err.message}`);
            return `error: ${err.message}`;
        } finally {
            setIsComposing(false);
        }
    }, [addImageToHistory, addLog]);

    const handleCompose = () => {
        const imgA = historyRef.current[historyIndexRef.current];
        const imgB = imageBRef.current;
        if (!imgB || !compositePrompt.trim()) return;
        runCompose(compositePrompt, imgA, imgB);
    };

    // ── Hotspot ──────────────────────────────────────────────────────────────
    const [hotspot, setHotspot] = useState<Hotspot | null>(null);
    const hotspotRef = useRef<Hotspot | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
        if (mode !== 'edit') return;
        const img = e.currentTarget;
        const rect = img.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        const { naturalWidth, naturalHeight, clientWidth, clientHeight } = img;
        const newHotspot = {
            x: Math.round(offsetX * naturalWidth / clientWidth),
            y: Math.round(offsetY * naturalHeight / clientHeight),
            displayX: offsetX, displayY: offsetY,
        };
        hotspotRef.current = newHotspot;
        setHotspot(newHotspot);
        addLog('tool', `Region selected at (${newHotspot.x}, ${newHotspot.y}) px`);
    };

    // ── Session state ────────────────────────────────────────────────────────
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [liveChunk, setLiveChunk] = useState('');
    const [fullTranscript, setFullTranscript] = useState('');
    const transcriptAccRef = useRef('');

    const sessionRef = useRef<any>(null);
    const inputCtxRef = useRef<AudioContext | null>(null);
    const outputCtxRef = useRef<AudioContext | null>(null);
    const nextStartRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const connectionReady = useRef(false);
    const streamRef = useRef<MediaStream | null>(null);
    const isMutedRef = useRef(false);
    useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

    const clearAudioQueue = useCallback(() => {
        sourcesRef.current.forEach(s => { try { s.stop(); } catch { } });
        sourcesRef.current.clear();
        if (outputCtxRef.current) nextStartRef.current = outputCtxRef.current.currentTime;
        setIsSpeaking(false); setLiveChunk('');
    }, []);

    const stopGlyph = useCallback(() => {
        addLog('system', 'Neural link terminated.');
        connectionReady.current = false;
        setIsSessionActive(false); setIsSpeaking(false); setLiveChunk('');
        if (sessionRef.current) { try { sessionRef.current.close(); } catch { } sessionRef.current = null; }
        sourcesRef.current.forEach(s => { try { s.stop(); } catch { } });
        sourcesRef.current.clear();
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
        if (inputCtxRef.current) { try { inputCtxRef.current.close(); } catch { } inputCtxRef.current = null; }
        if (outputCtxRef.current) { try { outputCtxRef.current.close(); } catch { } outputCtxRef.current = null; }
    }, [addLog]);

    // ── edit_image_region ────────────────────────────────────────────────────
    const handleEditImageRegion = useCallback(async (
        editPrompt: string, hotspotCoords: { x: number; y: number }
    ): Promise<string> => {
        const imageFile = historyRef.current[historyIndexRef.current];
        addLog('tool', `✦ Editing (${hotspotCoords.x}, ${hotspotCoords.y}): "${editPrompt}" [v${historyIndexRef.current + 1}]`);
        setIsEditing(true);
        try {
            const base64Data = await fileToBase64(imageFile);
            const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3.1-flash-image-preview',
                contents: [
                    { inlineData: { mimeType: imageFile.type || 'image/png', data: base64Data } },
                    { text: `You are an expert photo editor AI. Perform a natural, localized edit on the provided image.\nUser Request: "${editPrompt}"\nEdit Location: Focus on the area around pixel coordinates (x: ${hotspotCoords.x}, y: ${hotspotCoords.y}).\nGuidelines:\n- The edit must be realistic and blend seamlessly.\n- The rest of the image must remain identical.\n- Do not add watermarks, overlays, or borders.\nOutput: Return ONLY the final edited image. Do not return text.` },
                ],
                config: {
                    responseModalities: ['IMAGE', 'TEXT']
                }
            });
            const imagePart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
            if (!imagePart?.inlineData) {
                const textResponse = response.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text;
                throw new Error(textResponse || 'Model did not return an image.');
            }
            const { mimeType: outMime, data: outData } = imagePart.inlineData;
            addImageToHistory(dataURLtoFile(`data:${outMime};base64,${outData}`, `edited-${Date.now()}.png`));
            hotspotRef.current = null;
            setHotspot(null);
            addLog('tool', '✓ Edit applied — history updated.');
            return 'success';
        } catch (err: any) {
            addLog('error', `Edit failed: ${err.message}`);
            return `error: ${err.message}`;
        } finally {
            setIsEditing(false);
        }
    }, [addImageToHistory, addLog]);

    // ── compose_images voice tool ────────────────────────────────────────────
    const handleComposeVoice = useCallback(async (prompt: string): Promise<string> => {
        const imgA = historyRef.current[historyIndexRef.current];
        const imgB = imageBRef.current;
        if (!imgB) return 'error: Image B not loaded. Tell the user to click the ⬡ Compose tab and drag in a second image.';
        setMode('compose'); // show compose panel during generation
        return runCompose(prompt, imgA, imgB);
    }, [runCompose]);

    // ── Start session ────────────────────────────────────────────────────────
    const startGlyph = async () => {
        if (isSessionActive) return stopGlyph();
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) { addLog('error', 'VITE_GEMINI_API_KEY missing.'); return; }

        const systemInstruction = `You are SAY EDIT, an AI image editing and compositing assistant.

PRIMARY IMAGE (A): "${currentImage.name}"
SECONDARY IMAGE (B): ${imageBFile ? `"${imageBFile.name}" — loaded and ready` : 'Not loaded yet.'}

CAPABILITIES:
1. EDIT MODE — localized edits on Image A via edit_image_region tool.
   - User clicks a point on the image (hotspot), then describes a change.
2. COMPOSE MODE — combine Image A + Image B via compose_images tool.
   - User describes how to merge the two images.
   - If Image B is not loaded, tell the user to click the ⬡ tab and add a second image.

RULES:
- Voice-first. Keep responses under 20 seconds.
- Never hallucinate. Only describe what you are actually executing.
- After each successful operation, confirm briefly and offer to refine.`;

        try {
            const ai = new GoogleGenAI({ apiKey });
            inputCtxRef.current = new AudioContext({ sampleRate: 16000 });
            outputCtxRef.current = new AudioContext({ sampleRate: 24000 });
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            streamRef.current = stream;
            transcriptAccRef.current = '';
            setFullTranscript(''); setLiveChunk('');

            const session = await ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction,
                    outputAudioTranscription: {},
                    tools: [{
                        functionDeclarations: [
                            {
                                name: 'edit_image_region',
                                description: 'Edit a specific region of the current image (Image A) based on a prompt and coordinates.',
                                parameters: {
                                    type: Type.OBJECT,
                                    properties: {
                                        edit_prompt: { type: Type.STRING, description: 'Description of the edit: e.g. "change shirt to red", "blur background", "add sunglasses".' },
                                        hotspot_x: { type: Type.NUMBER, description: 'X pixel coordinate of the edit target.' },
                                        hotspot_y: { type: Type.NUMBER, description: 'Y pixel coordinate of the edit target.' },
                                    },
                                    required: ['edit_prompt', 'hotspot_x', 'hotspot_y'],
                                },
                            },
                            {
                                name: 'get_current_hotspot',
                                description: 'Returns the currently selected hotspot, or signals none is set.',
                                parameters: { type: Type.OBJECT, properties: {} },
                            },
                            {
                                name: 'compose_images',
                                description: 'Combine Image A and Image B into a composite scene. Use for merging two photos: outfits, backgrounds, product mockups, collages. Requires Image B to be loaded.',
                                parameters: {
                                    type: Type.OBJECT,
                                    properties: {
                                        composition_prompt: {
                                            type: Type.STRING,
                                            description: 'Detailed description of the composite: e.g. "Take the person from image A and dress them in the outfit from image B in a professional outdoor setting."',
                                        },
                                    },
                                    required: ['composition_prompt'],
                                },
                            },
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
                                turns: [{ role: 'user', parts: [{ text: `Image A loaded: "${currentImage.name}". ${imageBFile ? `Image B ready: "${imageBFile.name}".` : ''} Greet me briefly.` }] }],
                                turnComplete: true,
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
                                src.buffer = buf; src.connect(outputCtxRef.current.destination);
                                const now = outputCtxRef.current.currentTime;
                                const start = Math.max(now, nextStartRef.current);
                                src.start(start); nextStartRef.current = start + buf.duration;
                                sourcesRef.current.add(src);
                                src.onended = () => { sourcesRef.current.delete(src); if (sourcesRef.current.size === 0) setIsSpeaking(false); };
                            } catch { setIsSpeaking(false); }
                        }

                        if (m.toolCall) {
                            for (const fc of m.toolCall.functionCalls) {
                                if (fc.name === 'get_current_hotspot') {
                                    const h = hotspotRef.current;
                                    sessionRef.current?.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: h ? { hotspot_x: h.x, hotspot_y: h.y, selected: true } : { selected: false, message: 'No region selected.' } }] });
                                }
                                if (fc.name === 'edit_image_region') {
                                    const { edit_prompt, hotspot_x, hotspot_y } = fc.args;
                                    const result = await handleEditImageRegion(edit_prompt, { x: hotspot_x, y: hotspot_y });
                                    sessionRef.current?.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result, message: result === 'success' ? 'Image edited. History updated.' : result } }] });
                                }
                                if (fc.name === 'compose_images') {
                                    const { composition_prompt } = fc.args;
                                    const result = await handleComposeVoice(composition_prompt);
                                    sessionRef.current?.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result, message: result === 'success' ? 'Composite generated and added to edit history.' : result } }] });
                                }
                            }
                        }
                    },

                    onclose: (e: any) => { addLog('error', `Closed: ${e.code} — ${e.reason || 'no reason'}`); stopGlyph(); },
                    onerror: (e: any) => { addLog('error', `Error: ${e.message}`); stopGlyph(); },
                },
            });
            sessionRef.current = session;
        } catch (err: any) { addLog('error', `Init failed: ${err.message}`); stopGlyph(); }
    };

    // ── Manual edit fallback ─────────────────────────────────────────────────
    const [manualPrompt, setManualPrompt] = useState('');
    const handleManualEdit = async () => {
        if (!hotspot || !manualPrompt.trim()) return;
        await handleEditImageRegion(manualPrompt, hotspot);
        setManualPrompt('');
    };

    const handleDownload = () => {
        if (!currentImageUrl) return;
        const a = document.createElement('a'); a.href = currentImageUrl; a.download = `glyph-${currentImage.name}`; a.click();
    };

    const accent = mode === 'compose' ? C.purple : C.amber;
    const accentRgb = mode === 'compose' ? '170,68,255' : '255,170,0';
    const logColors: Record<LogEntry['type'], string> = { system: 'rgba(255,255,255,0.25)', ai: 'rgba(255,255,255,0.7)', user: `rgba(${accentRgb},0.75)`, tool: `rgba(${accentRgb},0.6)`, error: 'rgba(255,68,85,0.75)' };
    const logLabels: Record<LogEntry['type'], string> = { system: 'SYS', ai: 'SAY_EDIT', user: 'YOU', tool: 'TOOL', error: 'ERR' };

    // ─── RENDER ──────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', background: C.bg0, color: C.text, overflow: 'hidden', fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace" }}>

            {/* ── ICON SIDEBAR ──────────────────────────────────────────── */}
            <div style={{ width: '56px', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: '12px', background: C.bg1, borderRight: `1px solid ${C.border}`, flexShrink: 0 }}>
                {/* Logo */}
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: mode === 'compose' ? 'linear-gradient(135deg,#aa44ff,#6622bb)' : 'linear-gradient(135deg,#ffaa00,#cc7700)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 20px ${mode === 'compose' ? 'rgba(170,68,255,0.3)' : 'rgba(255,170,0,0.3)'}`, position: 'relative', transition: 'all 0.3s' }}>
                    <span style={{ color: 'white', fontSize: '15px', fontWeight: 700 }}>G</span>
                    <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', borderRadius: '50%', background: accent, border: `2px solid ${C.bg0}`, transition: 'background 0.3s' }} />
                </div>
                <div style={{ width: '24px', height: '1px', background: C.border, margin: '4px 0' }} />

                {/* Back */}
                <div onClick={onExit} title="Back" style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '14px', color: C.dim }}>←</div>

                {/* Edit mode icon */}
                <div onClick={() => setMode('edit')} title="Edit mode" style={{ width: '36px', height: '36px', borderRadius: '8px', background: mode === 'edit' ? 'rgba(255,170,0,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${mode === 'edit' ? 'rgba(255,170,0,0.4)' : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '15px', transition: 'all 0.2s' }}>✏️</div>

                {/* Compose mode icon */}
                <div onClick={() => setMode('compose')} title="Compose mode" style={{ width: '36px', height: '36px', borderRadius: '8px', background: mode === 'compose' ? 'rgba(170,68,255,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${mode === 'compose' ? 'rgba(170,68,255,0.4)' : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', transition: 'all 0.2s', position: 'relative', color: mode === 'compose' ? C.purple : C.dim }}>
                    ⬡
                    {imageBFile && <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '7px', height: '7px', borderRadius: '50%', background: C.purple, border: `1px solid ${C.bg0}` }} />}
                </div>

                <div style={{ marginTop: 'auto' }}>
                    <div onClick={stopGlyph} style={{ width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', color: 'rgba(255,68,85,0.4)' }}>⏻</div>
                </div>
            </div>

            {/* ── IMAGE CANVAS ──────────────────────────────────────────── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#000', borderRight: `1px solid ${C.border}`, minWidth: 0 }}>

                {/* Toolbar */}
                <div style={{ height: '48px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: '10px', background: 'rgba(6,6,6,0.95)', flexShrink: 0, zIndex: 20 }}>
                    <div style={{ padding: '4px 10px', borderRadius: '6px', background: `rgba(${accentRgb},0.08)`, border: `1px solid rgba(${accentRgb},0.22)`, fontSize: '9px', color: accent, letterSpacing: '0.25em', textTransform: 'uppercase', transition: 'all 0.3s' }}>
                        {mode === 'edit' ? 'Edit Mode' : 'Compose Mode'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: '6px', maxWidth: '240px', overflow: 'hidden' }}>
                        <span style={{ fontSize: '10px', color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>{currentImage.name}</span>
                        {imageBFile && <><span style={{ color: C.dimmer, fontSize: '9px', flexShrink: 0 }}>+</span><span style={{ fontSize: '9px', color: `rgba(${accentRgb},0.45)`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>{imageBFile.name}</span></>}
                    </div>

                    <button onClick={() => { if (canUndo) { setHistoryIndex(h => h - 1); setHotspot(null); } }} disabled={!canUndo} style={{ padding: '4px 10px', borderRadius: '6px', cursor: canUndo ? 'pointer' : 'not-allowed', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: canUndo ? C.text : C.dimmer, fontSize: '10px', fontFamily: 'monospace', letterSpacing: '0.1em' }}>↩ Undo</button>
                    <button onClick={() => { if (canRedo) { setHistoryIndex(h => h + 1); setHotspot(null); } }} disabled={!canRedo} style={{ padding: '4px 10px', borderRadius: '6px', cursor: canRedo ? 'pointer' : 'not-allowed', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: canRedo ? C.text : C.dimmer, fontSize: '10px', fontFamily: 'monospace', letterSpacing: '0.1em' }}>↪ Redo</button>

                    {canUndo && (
                        <button onMouseDown={() => setIsComparing(true)} onMouseUp={() => setIsComparing(false)} onMouseLeave={() => setIsComparing(false)} onTouchStart={() => setIsComparing(true)} onTouchEnd={() => setIsComparing(false)} style={{ padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.dim, fontSize: '10px', fontFamily: 'monospace', letterSpacing: '0.1em' }}>👁 Compare</button>
                    )}

                    <button onClick={handleDownload} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)', color: C.green, fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.15em' }}>↓ Export</button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 12px', borderRadius: '20px', border: `1px solid ${isSessionActive ? `rgba(${accentRgb},0.3)` : C.border}`, background: isSessionActive ? `rgba(${accentRgb},0.04)` : 'transparent', transition: 'all 0.4s' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: (isEditing || isComposing) ? accent : isSessionActive ? isSpeaking ? accent : `rgba(${accentRgb},0.5)` : 'rgba(255,255,255,0.18)', boxShadow: (isEditing || isComposing) ? `0 0 8px ${accent}` : 'none', transition: 'all 0.3s' }} />
                        <span style={{ fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.2em', color: (isEditing || isComposing) ? accent : isSessionActive ? `rgba(${accentRgb},0.7)` : C.dim }}>
                            {isEditing ? 'Editing...' : isComposing ? 'Compositing...' : isSessionActive ? isSpeaking ? 'AI Speaking' : 'Listening' : 'Offline'}
                        </span>
                    </div>
                </div>

                {/* Canvas */}
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#030303' }}>
                    <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle, rgba(${accentRgb},0.04) 1px, transparent 1px)`, backgroundSize: '32px 32px', pointerEvents: 'none', transition: 'background-image 0.3s' }} />

                    {(isEditing || isComposing) && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                            <div style={{ width: '48px', height: '48px', border: `2px solid ${accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            <p style={{ fontSize: '11px', color: accent, letterSpacing: '0.3em', textTransform: 'uppercase', margin: 0 }}>{isComposing ? 'Compositing Images...' : 'AI Editing...'}</p>
                            {isComposing && <p style={{ fontSize: '10px', color: C.dim, margin: 0 }}>This may take 15–30 seconds</p>}
                        </div>
                    )}

                    <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%' }}>
                        {originalImageUrl && <img src={originalImageUrl} alt="Original" style={{ maxWidth: '80vw', maxHeight: 'calc(100vh - 200px)', objectFit: 'contain', display: 'block', userSelect: 'none', pointerEvents: 'none' }} />}
                        {currentImageUrl && (
                            <img ref={imgRef} src={currentImageUrl} alt="Current" onClick={handleImageClick}
                                style={{ position: originalImageUrl !== currentImageUrl ? 'absolute' : 'relative', top: 0, left: 0, maxWidth: '80vw', maxHeight: 'calc(100vh - 200px)', objectFit: 'contain', display: 'block', cursor: mode === 'edit' ? 'crosshair' : 'default', userSelect: 'none', opacity: isComparing ? 0 : 1, transition: 'opacity 0.2s' }}
                            />
                        )}

                        {/* Hotspot */}
                        {hotspot && !isEditing && mode === 'edit' && (
                            <div style={{ position: 'absolute', left: hotspot.displayX, top: hotspot.displayY, transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 10 }}>
                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: `rgba(${accentRgb},0.25)`, border: `2px solid ${accent}` }}>
                                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `rgba(${accentRgb},0.2)`, animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }} />
                                </div>
                                <div style={{ position: 'absolute', top: '50%', left: '-12px', width: '48px', height: '1px', background: `rgba(${accentRgb},0.4)`, transform: 'translateY(-50%)' }} />
                                <div style={{ position: 'absolute', left: '50%', top: '-12px', width: '1px', height: '48px', background: `rgba(${accentRgb},0.4)`, transform: 'translateX(-50%)' }} />
                            </div>
                        )}
                    </div>

                    {/* Hints */}
                    {!hotspot && !isEditing && mode === 'edit' && (
                        <div style={{ position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', padding: '8px 16px', background: 'rgba(0,0,0,0.7)', border: `1px solid ${C.border}`, borderRadius: '8px', fontSize: '10px', color: C.dim, letterSpacing: '0.2em', textTransform: 'uppercase', pointerEvents: 'none' }}>
                            Click image to select edit region
                        </div>
                    )}
                    {mode === 'compose' && !isComposing && (
                        <div style={{ position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', padding: '8px 16px', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(170,68,255,0.2)', borderRadius: '8px', fontSize: '10px', color: 'rgba(170,68,255,0.5)', letterSpacing: '0.2em', textTransform: 'uppercase', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                            {imageBFile ? '⬡ Use the Compose panel → describe your composite' : '⬡ Add Image B in the Compose panel →'}
                        </div>
                    )}
                </div>

                {/* Manual prompt bar */}
                {!isSessionActive && hotspot && mode === 'edit' && (
                    <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '8px', background: 'rgba(6,6,6,0.95)' }}>
                        <input value={manualPrompt} onChange={e => setManualPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleManualEdit()}
                            placeholder="Describe your edit (e.g. 'change shirt to red')..."
                            style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border2}`, borderRadius: '8px', padding: '10px 14px', color: C.text, fontSize: '12px', fontFamily: 'monospace', outline: 'none' }} />
                        <button onClick={handleManualEdit} disabled={!manualPrompt.trim() || isEditing}
                            style={{ padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', background: `rgba(${accentRgb},0.1)`, border: `1px solid rgba(${accentRgb},0.3)`, color: accent, fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                            Edit
                        </button>
                    </div>
                )}
            </div>

            {/* ── TRANSCRIPT PANEL ──────────────────────────────────────── */}
            <TranscriptPanel fullTranscript={fullTranscript} liveChunk={liveChunk} isActive={isSessionActive} isSpeaking={isSpeaking} hotspot={hotspot} mode={mode} />

            {/* ── INTELLIGENCE / COMPOSE DRAWER ─────────────────────────── */}
            <div style={{ width: '300px', display: 'flex', flexDirection: 'column', background: C.bg1, flexShrink: 0 }}>
                <div style={{ height: '48px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', flexShrink: 0 }}>
                    <span style={{ fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.4em', color: `rgba(${accentRgb},0.5)`, transition: 'color 0.3s' }}>
                        {mode === 'compose' ? 'Composite Studio' : 'System Log'}
                    </span>
                    <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                        {Array.from({ length: 14 }).map((_, i) => (
                            <div key={i} style={{ width: '2px', borderRadius: '2px', height: isSessionActive && isSpeaking ? `${4 + Math.abs(Math.sin(i * 0.9)) * 14}px` : '3px', background: isSessionActive && isSpeaking ? accent : isSessionActive ? `rgba(${accentRgb},0.3)` : 'rgba(255,255,255,0.1)', transition: 'height 0.15s, background 0.3s' }} />
                        ))}
                    </div>
                </div>

                {/* Body — compose panel or log */}
                {mode === 'compose' ? (
                    <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
                        <ComposePanel imageA={currentImage} imageB={imageBFile} imageAUrl={currentImageUrl} imageBUrl={imageBUrl} onDropB={f => { setImageBFile(f); addLog('tool', `Image B loaded: "${f.name}"`); }} onRemoveB={() => { setImageBFile(null); addLog('system', 'Image B removed.'); }} compositePrompt={compositePrompt} onPromptChange={setCompositePrompt} onCompose={handleCompose} isComposing={isComposing} />
                    </div>
                ) : (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', scrollbarWidth: 'none' }}>
                        {log.map((entry, i) => (
                            <div key={i} style={{ display: 'flex', gap: '10px', padding: '3px 0' }}>
                                <span style={{ fontSize: '8px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', color: logColors[entry.type], opacity: 0.6, flexShrink: 0, width: '34px', marginTop: '2px' }}>{logLabels[entry.type]}</span>
                                <span style={{ fontSize: '12px', lineHeight: 1.65, color: logColors[entry.type], fontWeight: 300 }}>{entry.text}</span>
                            </div>
                        ))}
                        <div ref={logEndRef} />
                    </div>
                )}

                {/* History counter */}
                {history.length > 1 && (
                    <div style={{ margin: '0 12px 10px', padding: '9px 13px', background: `rgba(${accentRgb},0.04)`, border: `1px solid rgba(${accentRgb},0.14)`, borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.2em', color: `rgba(${accentRgb},0.45)` }}>Edit History</span>
                            <span style={{ fontSize: '11px', color: `rgba(${accentRgb},0.6)` }}>{historyIndex + 1} / {history.length}</span>
                        </div>
                    </div>
                )}

                {/* Controls */}
                <div style={{ padding: '14px', borderTop: `1px solid ${C.border}`, background: C.bg0, display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    {isSessionActive && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setIsMuted(m => !m)} style={{ flex: 1, padding: '7px 0', borderRadius: '7px', cursor: 'pointer', background: isMuted ? 'rgba(255,68,85,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isMuted ? 'rgba(255,68,85,0.3)' : C.border}`, color: isMuted ? C.red : C.dim, fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                {isMuted ? '🔇 Muted' : '🎙 Live'}
                            </button>
                            <button onClick={clearAudioQueue} style={{ flex: 1, padding: '7px 0', borderRadius: '7px', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.dim, fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}>⏹ Interrupt</button>
                        </div>
                    )}
                    <button onClick={startGlyph} disabled={isEditing || isComposing}
                        style={{ width: '100%', padding: '15px', borderRadius: '9px', cursor: (isEditing || isComposing) ? 'not-allowed' : 'pointer', background: isSessionActive ? 'rgba(255,68,85,0.08)' : `rgba(${accentRgb},0.08)`, border: `1px solid ${isSessionActive ? 'rgba(255,68,85,0.4)' : `rgba(${accentRgb},0.35)`}`, color: isSessionActive ? C.red : accent, fontSize: '11px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.25em', transition: 'all 0.2s' }}>
                        {isSessionActive ? '⏻  Terminate Link' : '▶  Initialize SAY EDIT'}
                    </button>
                </div>
            </div>

            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;700&display=swap');
        * { box-sizing: border-box; }
        body, html { margin: 0; padding: 0; height: 100%; }
        ::-webkit-scrollbar { display: none; }
        @keyframes wave { from { transform:scaleY(0.35); } to { transform:scaleY(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
      `}</style>
        </div>
    );
};

export default GlyphImageWorkspace;