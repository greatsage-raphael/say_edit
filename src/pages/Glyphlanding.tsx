import React, { useState, useRef } from 'react';

// ─── THEME ────────────────────────────────────────────────────────────────────
const C = {
  bg0: '#020202', bg1: '#050505',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(255,255,255,0.12)',
  blue: '#0088ff', green: '#00ff88', amber: '#ffaa00',
  text: '#e8e8e8', dim: 'rgba(232,232,232,0.30)', dimmer: 'rgba(232,232,232,0.10)',
};

type Mode = 'pdf' | 'image';

interface GlyphLandingProps {
  onSelectPdf: (file: File) => void;
  onSelectImage: (file: File) => void;
}

const GlyphLanding: React.FC<GlyphLandingProps> = ({ onSelectPdf, onSelectImage }) => {
  const [hoveredMode, setHoveredMode] = useState<Mode | null>(null);
  const [dragging, setDragging] = useState<Mode | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File, mode: Mode) => {
    if (mode === 'pdf') onSelectPdf(file);
    else onSelectImage(file);
  };

  const handleDrop = (e: React.DragEvent, mode: Mode) => {
    e.preventDefault();
    setDragging(null);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file, mode);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      minHeight: '100vh', width: '100%',
      background: C.bg0, color: C.text, overflowX: 'hidden', overflowY: 'auto',
      fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
      alignItems: 'center',
    }}>
      {/* Scanline overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.008) 3px,rgba(255,255,255,0.008) 4px)',
      }} />

      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, left: 0, right: 0, width: '100%',
        height: '56px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', background: 'rgba(2,2,2,0.95)', zIndex: 10,
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg,#0088ff,#0044cc)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px rgba(0,136,255,0.4)', flexShrink: 0 }}>
            <span style={{ color: 'white', fontSize: '14px', fontWeight: 700 }}>G</span>
          </div>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.text }}>SAY EDIT</span>
          <span style={{ fontSize: '9px', color: C.dim, letterSpacing: '0.2em' }}>v2.0</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.green, boxShadow: `0 0 8px ${C.green}`, flexShrink: 0 }} />
          <span style={{ fontSize: '9px', color: 'rgba(0,255,136,0.5)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Online</span>
        </div>
      </div>

      {/* Main content */}
      <div style={{
        position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '36px', padding: '40px 16px 48px',
        width: '100%', maxWidth: '720px', boxSizing: 'border-box',
      }}>
        {/* Title */}
        <div style={{ textAlign: 'center', width: '100%' }}>
          <p style={{ fontSize: '9px', fontFamily: 'monospace', letterSpacing: '0.5em', textTransform: 'uppercase', color: C.dim, margin: '0 0 12px' }}>
            AI-Powered Document & Image Intelligence
          </p>
          <h1 style={{ fontSize: 'clamp(24px, 6vw, 48px)', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            What are you <span style={{ color: C.blue }}>analyzing</span>?
          </h1>
          <p style={{ margin: '12px 0 0', color: C.dim, fontSize: '12px', letterSpacing: '0.04em' }}>
            Select a file type to route to the correct workspace
          </p>
        </div>

        {/* Mode cards — stack on mobile, side-by-side on wider screens */}
        <div style={{
          display: 'flex', gap: '16px', width: '100%',
          flexDirection: 'column',
        }}>
          {/* We use a media-query trick via inline style on a wrapper */}
          <style>{`
            @media (min-width: 600px) {
              .landing-cards { flex-direction: row !important; }
              .landing-divider { display: flex !important; flex-direction: column !important; width: auto !important; }
              .landing-divider-line-h { display: none !important; }
              .landing-divider-line-v { display: block !important; }
            }
            @media (max-width: 599px) {
              .landing-divider-line-h { display: block !important; }
              .landing-divider-line-v { display: none !important; }
            }
          `}</style>

          <div className="landing-cards" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', alignItems: 'stretch' }}>

            {/* PDF Card */}
            <div
              onMouseEnter={() => setHoveredMode('pdf')}
              onMouseLeave={() => setHoveredMode(null)}
              onDragOver={(e) => { e.preventDefault(); setDragging('pdf'); }}
              onDragLeave={() => setDragging(null)}
              onDrop={(e) => handleDrop(e, 'pdf')}
              onClick={() => pdfInputRef.current?.click()}
              style={{
                flex: 1, padding: '28px 20px',
                borderRadius: '14px', cursor: 'pointer',
                background: hoveredMode === 'pdf' ? 'rgba(0,136,255,0.05)' : dragging === 'pdf' ? 'rgba(0,136,255,0.08)' : 'rgba(8,8,8,0.8)',
                border: `1px solid ${hoveredMode === 'pdf' || dragging === 'pdf' ? 'rgba(0,136,255,0.4)' : C.border2}`,
                transition: 'all 0.25s ease',
                boxShadow: hoveredMode === 'pdf' ? '0 8px 30px rgba(0,136,255,0.1)' : 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
              }}
            >
              <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f, 'pdf'); e.target.value = ''; }} />

              <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: 'rgba(0,136,255,0.1)', border: '1px solid rgba(0,136,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', boxShadow: hoveredMode === 'pdf' ? '0 0 20px rgba(0,136,255,0.2)' : 'none', transition: 'all 0.25s' }}>
                📄
              </div>

              <div style={{ textAlign: 'center', width: '100%' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: hoveredMode === 'pdf' ? C.blue : C.text }}>Document</h2>
                <p style={{ margin: 0, fontSize: '11px', color: C.dim, lineHeight: 1.7 }}>
                  Upload a PDF to navigate spatially with voice. Ask questions and SAY EDIT highlights the exact passage on the page.
                </p>
              </div>

              <div style={{ width: '100%', borderTop: `1px solid ${C.border}`, paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {['Voice-driven navigation', 'Sentence-level highlighting', 'Vector semantic search'].map(feat => (
                  <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: hoveredMode === 'pdf' ? C.blue : C.dim, flexShrink: 0 }} />
                    <span style={{ fontSize: '10px', color: C.dim }}>{feat}</span>
                  </div>
                ))}
              </div>

              <div style={{ width: '100%', padding: '10px', borderRadius: '8px', background: hoveredMode === 'pdf' ? 'rgba(0,136,255,0.1)' : C.dimmer, border: `1px solid ${hoveredMode === 'pdf' ? 'rgba(0,136,255,0.3)' : C.border}`, textAlign: 'center', fontSize: '10px', color: hoveredMode === 'pdf' ? C.blue : C.dim, letterSpacing: '0.15em', textTransform: 'uppercase', transition: 'all 0.25s' }}>
                {dragging === 'pdf' ? 'Drop PDF here' : 'Tap or drag PDF'}
              </div>
            </div>

            {/* Divider */}
            <div className="landing-divider" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}>
              <div className="landing-divider-line-h" style={{ flex: 1, height: '1px', background: C.border }} />
              <div className="landing-divider-line-v" style={{ width: '1px', height: '40px', background: C.border }} />
              <span style={{ fontSize: '9px', color: C.dimmer, letterSpacing: '0.3em' }}>OR</span>
              <div className="landing-divider-line-h" style={{ flex: 1, height: '1px', background: C.border }} />
              <div className="landing-divider-line-v" style={{ width: '1px', height: '40px', background: C.border }} />
            </div>

            {/* Image Card */}
            <div
              onMouseEnter={() => setHoveredMode('image')}
              onMouseLeave={() => setHoveredMode(null)}
              onDragOver={(e) => { e.preventDefault(); setDragging('image'); }}
              onDragLeave={() => setDragging(null)}
              onDrop={(e) => handleDrop(e, 'image')}
              onClick={() => imageInputRef.current?.click()}
              style={{
                flex: 1, padding: '28px 20px',
                borderRadius: '14px', cursor: 'pointer',
                background: hoveredMode === 'image' ? 'rgba(255,170,0,0.04)' : dragging === 'image' ? 'rgba(255,170,0,0.07)' : 'rgba(8,8,8,0.8)',
                border: `1px solid ${hoveredMode === 'image' || dragging === 'image' ? 'rgba(255,170,0,0.35)' : C.border2}`,
                transition: 'all 0.25s ease',
                boxShadow: hoveredMode === 'image' ? '0 8px 30px rgba(255,170,0,0.08)' : 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
              }}
            >
              <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f, 'image'); e.target.value = ''; }} />

              <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', boxShadow: hoveredMode === 'image' ? '0 0 20px rgba(255,170,0,0.15)' : 'none', transition: 'all 0.25s' }}>
                🖼️
              </div>

              <div style={{ textAlign: 'center', width: '100%' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: hoveredMode === 'image' ? C.amber : C.text }}>Image</h2>
                <p style={{ margin: 0, fontSize: '11px', color: C.dim, lineHeight: 1.7 }}>
                  Upload a photo and click any region. Talk to SAY EDIT and it will edit the selected area in real time.
                </p>
              </div>

              <div style={{ width: '100%', borderTop: `1px solid ${C.border}`, paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {['Click-to-select region', 'Voice-commanded edits', 'Full edit history + undo'].map(feat => (
                  <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: hoveredMode === 'image' ? C.amber : C.dim, flexShrink: 0 }} />
                    <span style={{ fontSize: '10px', color: C.dim }}>{feat}</span>
                  </div>
                ))}
              </div>

              <div style={{ width: '100%', padding: '10px', borderRadius: '8px', background: hoveredMode === 'image' ? 'rgba(255,170,0,0.08)' : C.dimmer, border: `1px solid ${hoveredMode === 'image' ? 'rgba(255,170,0,0.28)' : C.border}`, textAlign: 'center', fontSize: '10px', color: hoveredMode === 'image' ? C.amber : C.dim, letterSpacing: '0.15em', textTransform: 'uppercase', transition: 'all 0.25s' }}>
                {dragging === 'image' ? 'Drop image here' : 'Tap or drag image'}
              </div>
            </div>
          </div>
        </div>

        {/* Supported formats */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {[{ label: 'PDF', color: C.blue }, { label: 'JPG', color: C.amber }, { label: 'PNG', color: C.amber }, { label: 'WEBP', color: C.amber }, { label: 'GIF', color: C.amber }].map(({ label }) => (
            <div key={label} style={{ fontSize: '9px', fontFamily: 'monospace', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.15)', padding: '3px 8px', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '4px' }}>{label}</div>
          ))}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;700&display=swap');
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
};

export default GlyphLanding;