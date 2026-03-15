import React from 'react';
import { Viewer, Worker } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';

interface PdfCanvasProps {
  fileUrl: string;
  activeSection: { page: number; rect: number[] } | null;
}

const PdfCanvas: React.FC<PdfCanvasProps> = ({ fileUrl, activeSection }) => {
  return (
    // Ensure this div fills the container
    <div className="h-full w-full bg-[#111] relative border border-white/5">
      <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js">
        <Viewer 
          fileUrl={fileUrl}
          // The page in state is 1-indexed, viewer is 0-indexed
          initialPage={activeSection ? activeSection.page - 1 : 0}
        />
      </Worker>

      {/* SPATIAL HIGHLIGHT OVERLAY */}
      {activeSection && (
        <div 
          className="absolute border-2 border-blue-500 bg-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse pointer-events-none z-[100] transition-all duration-500"
          style={{
            left: `${activeSection.rect[0]}px`,
            top: `${activeSection.rect[1]}px`,
            width: `${activeSection.rect[2]}px`,
            height: `${activeSection.rect[3]}px`,
          }}
        />
      )}
    </div>
  );
};

export default PdfCanvas;