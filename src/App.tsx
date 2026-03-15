import React, { useState } from 'react';
import GlyphLanding from './pages/Glyphlanding';
import GlyphWorkspace from './pages/GlyphWorkspace';         // existing PDF workspace
import GlyphImageWorkspace from './pages/Glyphimageworkspace'; // new image workspace
import './index.css';

type Route =
  | { mode: 'landing' }
  | { mode: 'pdf'; file: File }
  | { mode: 'image'; file: File };

const App: React.FC = () => {
  const [route, setRoute] = useState<Route>({ mode: 'landing' });

  const handleSelectPdf = (file: File) => setRoute({ mode: 'pdf', file });
  const handleSelectImage = (file: File) => setRoute({ mode: 'image', file });
  const handleExit = () => setRoute({ mode: 'landing' });

  if (route.mode === 'pdf') {
    // GlyphWorkspace already manages its own upload state internally.
    // We pass the pre-selected file via an onReady prop (or you can adapt
    // GlyphWorkspace to accept an `initialFile` prop if preferred).
    // For now we mount it and it handles the rest of its own state.
    return (
      <div className="min-h-screen bg-[#030303]">
        <GlyphWorkspace initialFile={route.file} onExit={handleExit} />
      </div>
    );
  }

  if (route.mode === 'image') {
    return (
      <div className="min-h-screen bg-[#020202]">
        <GlyphImageWorkspace initialFile={route.file} onExit={handleExit} />
      </div>
    );
  }

  return <GlyphLanding onSelectPdf={handleSelectPdf} onSelectImage={handleSelectImage} />;
};

export default App;