import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GlassSurface, type GlassSurfaceProps } from '../../src/components/ui/GlassSurface';
import '../../src/styles/liquid-glass.css';

function Fixture() {
  const [props, setProps] = useState<GlassSurfaceProps>({ material: 'control', blurPx: 0, displacementScale: 0, highlightOpacity: 0, fill: 'transparent' });
  const [size, setSize] = useState({ width: 300, height: 170 });
  Object.assign(window, { updateGlassFixture: setProps, resizeGlassFixture: setSize });
  return <div style={{ minHeight: '100vh', padding: 80, background: 'repeating-conic-gradient(#204556 0% 25%, #dde5bf 0% 50%) 0 0 / 36px 36px' }}>
    <GlassSurface {...props} id="fixture-glass" style={{ width: size.width, height: size.height, ...props.style }}>
      <button className="glass-action" style={{ width: '100%', height: size.height }} type="button">Glass</button>
    </GlassSurface>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture /></React.StrictMode>);
