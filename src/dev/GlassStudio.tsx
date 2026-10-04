import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, Copy, Download, ExternalLink, Focus, Layers, Monitor, MousePointer2, RotateCcw, Save, Smartphone, Tablet, Trash2, Upload } from 'lucide-react';
import { fieldsFor, glassTypes, validateProfiles, type GlassField, type GlassProfiles, type GlassSettings, type GlassType } from '../content/glassSchema';
import { previewGlass, replaceGlassSettings, useGlassSettings } from '../content/glassStore';
import original from '../content/glass-frosted-original.json';
import './glass-studio.css';

const devices = { desktop: { width: 1280, height: 900, label: '桌面', Icon: Monitor }, tablet: { width: 768, height: 1024, label: '平板', Icon: Tablet }, mobile: { width: 390, height: 844, label: '手机', Icon: Smartphone }, narrow: { width: 320, height: 740, label: '窄屏', Icon: Smartphone } };
const allTypes = Object.keys(glassTypes) as GlassType[];

function Parameter({ field, value, change }: { field: GlassField; value: string | number | boolean; change: (value: string | number | boolean) => void }) {
  if (field.type === 'boolean') return <label className="gs-toggle"><span>{field.label}</span><input type="checkbox" checked={Boolean(value)} onChange={e => change(e.target.checked)} /></label>;
  if (field.type === 'select') return <label className="gs-field"><span>{field.label}</span><select value={String(value)} onChange={e => change(e.target.value)}>{field.options!.map(option => <option key={option}>{option}</option>)}</select></label>;
  if (field.type === 'color') return <label className="gs-color"><span>{field.label}</span><code>{String(value)}</code><input type="color" aria-label={field.label} value={String(value)} onChange={e => change(e.target.value)} /></label>;
  return <div className="gs-range"><label htmlFor={`range-${field.key}`}>{field.label}<span>{field.unit}</span></label><div>
    <input id={`range-${field.key}`} aria-label={field.label} type="range" min={field.min} max={field.max} step={field.step} value={Number(value)} onChange={e => change(Number(e.target.value))} />
    <input aria-label={`${field.label}数值`} type="number" min={field.min} max={field.max} step={field.step} value={Number(value)} onChange={e => { if (e.target.value !== '') change(Math.max(field.min!, Math.min(field.max!, Number(e.target.value)))); }} />
  </div></div>;
}

export default function GlassStudio() {
  const state = useGlassSettings();
  const [type, setType] = useState<GlassType>('control');
  const [preset, setPreset] = useState('frosted-original');
  const [presetName, setPresetName] = useState('');
  const [copyTarget, setCopyTarget] = useState<GlassType>('social');
  const [route, setRoute] = useState('/publications');
  const [device, setDevice] = useState<keyof typeof devices>('desktop');
  const [picking, setPicking] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [message, setMessage] = useState('正在读取本地参数…');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(1);
  const [previewReady, setPreviewReady] = useState(false);
  const saved = useRef(JSON.stringify(state.profiles));
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(state.profiles) !== saved.current;
  const selectedPreset = state.presets.find(p => p.id === preset);
  const size = devices[device];
  const send = (kind: string, payload: Record<string, unknown> = {}) => frame.current?.contentWindow?.postMessage({ kind, ...payload }, location.origin);

  useEffect(() => {
    fetch('/__glass/api/settings', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('本地参数服务不可用'); return r.json(); })
      .then((data: GlassSettings) => { saved.current = JSON.stringify(data.profiles); replaceGlassSettings(data); setMessage('本地参数已载入'); })
      .catch(e => { setError(true); setMessage(e.message); });
  }, []);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.max(0.15, Math.min(1, (entry.contentRect.width - 32) / size.width, (entry.contentRect.height - 32) / size.height))));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [size]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.kind === 'glass:selected' && e.data.type in glassTypes) { setType(e.data.type); setPicking(false); }
      if (e.data?.kind === 'glass:counts') { setCounts(e.data.counts); setPreviewReady(true); }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => { send('glass:focus', { type, highlight, scroll: !!counts[type] }); }, [type, highlight, previewReady, counts[type]]);
  useEffect(() => { send('glass:pick', { enabled: picking }); }, [picking, previewReady]);
  useEffect(() => {
    const tick = requestAnimationFrame(() => send('glass:focus', { type, highlight, scroll: true }));
    return () => cancelAnimationFrame(tick);
  }, [device]);

  const notify = (text: string) => { setError(false); setMessage(text); };
  const change = (key: string, value: number | string | boolean) => {
    previewGlass({ ...state.profiles, [type]: { ...state.profiles[type], [key]: value } });
    notify('实时预览 · 尚未保存为默认');
  };
  const save = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setError(false);
    try {
      const response = await fetch('/__glass/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, profiles: state.profiles, ...extra }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存失败');
      saved.current = JSON.stringify(data.profiles);
      replaceGlassSettings(data);
      previewGlass(data.profiles);
      if (action === 'savePreset') { setPreset(data.presets.at(-1).id); setPresetName(''); }
      if (action === 'deletePreset') setPreset('frosted-original');
      notify(action === 'deletePreset' ? '预设已删除' : '已保存到本地 · 发布网站时才会上线');
    } catch (e) { setError(true); setMessage(e instanceof Error ? e.message : '保存失败'); }
    finally { setBusy(false); }
  };
  const chooseType = (next: GlassType) => {
    setType(next);
    if (!counts[next]) { setPreviewReady(false); setRoute(glassTypes[next].route); }
    else send('glass:focus', { type: next, highlight, scroll: true });
  };
  const exportPreset = () => {
    const blob = new Blob([JSON.stringify({ name: presetName || '当前玻璃参数', profiles: state.profiles }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'glass-preset.json'; link.click(); URL.revokeObjectURL(url);
  };
  const importPreset = async (file?: File) => {
    if (!file) return;
    try { const data = JSON.parse(await file.text()); validateProfiles(data.profiles); previewGlass(data.profiles); setPresetName(String(data.name || '导入预设').slice(0, 60)); notify('已导入到实时预览 · 可另存为预设'); }
    catch (e) { setError(true); setMessage(e instanceof Error ? e.message : '无法导入预设'); }
    finally { if (importInput.current) importInput.current.value = ''; }
  };

  return <main className="glass-studio">
    <header className="gs-header"><div className="gs-title"><Layers size={22} /><h1>Glass Studio</h1><span>本地材质控制台</span></div><div className="gs-header-actions"><span className={dirty ? 'gs-dirty' : 'gs-saved'}>{dirty ? '未保存的预览' : '已保存'}</span><button className="gs-primary" disabled={busy} onClick={() => void save('saveDefault')}><Save size={16} />保存为默认</button><a href={route} target="_blank" rel="noreferrer" title="在独立窗口打开真实页面" aria-label="打开真实页面"><ExternalLink size={18} /></a></div></header>
    <aside className="gs-sidebar">
      <section className="gs-section"><h2>组件类型</h2><select aria-label="组件类型" value={type} onChange={e => chooseType(e.target.value as GlassType)}>{allTypes.map(key => <option key={key} value={key}>{glassTypes[key].label}</option>)}</select>
        <div className="gs-type-meta"><code>{type}</code><span>当前页面 {counts[type] || 0} 个实例</span></div>
        <div className="gs-row"><button aria-pressed={picking} onClick={() => setPicking(!picking)}><MousePointer2 size={15} />点选组件</button><button aria-pressed={highlight} onClick={() => setHighlight(!highlight)}><Focus size={15} />高亮同类</button></div>
      </section>
      <section className="gs-section gs-presets"><h2>预设</h2><select aria-label="预设" value={preset} onChange={e => setPreset(e.target.value)}>{state.presets.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select>
        <div className="gs-row"><button disabled={!selectedPreset} onClick={() => { previewGlass({ ...state.profiles, [type]: structuredClone(selectedPreset!.profiles[type]) }); notify('已套用到当前组件类型'); }}>套用当前类型</button><button disabled={!selectedPreset} onClick={() => { previewGlass(structuredClone(selectedPreset!.profiles)); notify('已套用整套参数'); }}>套用整套</button><button className="gs-icon" aria-label="删除选中预设" title="删除选中预设" disabled={!selectedPreset || selectedPreset.locked || busy} onClick={() => { if (confirm(`删除预设“${selectedPreset!.name}”？`)) void save('deletePreset', { id: preset }); }}><Trash2 size={16} /></button></div>
        <div className="gs-row"><input aria-label="新预设名称" placeholder="新预设名称" maxLength={60} value={presetName} onChange={e => setPresetName(e.target.value)} /><button className="gs-icon" aria-label="保存并应用预设" title="保存并应用预设" disabled={busy || !presetName.trim()} onClick={() => void save('savePreset', { name: presetName })}><Save size={17} /></button></div>
        <div className="gs-row"><button onClick={exportPreset}><Download size={15} />导出</button><button onClick={() => importInput.current?.click()}><Upload size={15} />导入</button><button title="恢复全部原始毛玻璃参数" onClick={() => { previewGlass(structuredClone(original) as GlassProfiles); notify('已恢复原始毛玻璃预览'); }}><RotateCcw size={15} />原始</button></div>
        <input ref={importInput} hidden type="file" accept=".json,application/json" onChange={e => void importPreset(e.target.files?.[0])} />
      </section>
      <section className="gs-section gs-parameters"><div className="gs-section-heading"><h2>材质参数</h2><button className="gs-icon" aria-label="恢复当前类型原始参数" title="恢复当前类型原始参数" onClick={() => previewGlass({ ...state.profiles, [type]: structuredClone(original[type]) })}><RotateCcw size={15} /></button></div>
        {fieldsFor(type).map(field => <Parameter key={`${type}-${field.key}`} field={field} value={state.profiles[type][field.key]} change={value => change(field.key, value)} />)}
        {glassTypes[type].kind === 'surface' && <div className="gs-copy"><label htmlFor="copy-type">复制当前材质到</label><div className="gs-row"><select id="copy-type" value={copyTarget} onChange={e => setCopyTarget(e.target.value as GlassType)}>{allTypes.filter(k => glassTypes[k].kind === 'surface').map(key => <option key={key} value={key}>{glassTypes[key].label}</option>)}</select><button className="gs-icon" aria-label="复制材质到目标类型" title="复制材质到目标类型" onClick={() => { const next = { ...state.profiles, [copyTarget]: structuredClone(state.profiles[type]) }; previewGlass(next); chooseType(copyTarget); notify('材质已复制到目标类型'); }}><Copy size={16} /></button></div></div>}
      </section>
    </aside>
    <section className="gs-workspace">
      <div className="gs-toolbar"><select aria-label="预览页面" value={route} onChange={e => { setPreviewReady(false); setRoute(e.target.value); }}><option value="/">首页</option><option value="/#about">About</option><option value="/publications">Publications</option><option value="/#projects">Projects</option><option value="/#experience">Experience</option><option value="/#membership">Membership</option></select><div className="gs-devices" role="group" aria-label="预览尺寸">{Object.entries(devices).map(([key, item]) => <button key={key} title={item.label} aria-label={item.label} aria-pressed={device === key} onClick={() => setDevice(key as keyof typeof devices)}><item.Icon size={17} /><span>{item.label}</span></button>)}</div><code>{size.width} × {size.height} · {Math.round(scale * 100)}%</code></div>
      <div ref={stage} className="gs-stage"><div className="gs-device" style={{ width: size.width * scale, height: size.height * scale } as CSSProperties}><iframe ref={frame} title="真实网站实时预览" src={`${route.split('#')[0]}?glassStudioPreview=1${route.includes('#') ? '#' + route.split('#')[1] : ''}`} style={{ width: size.width, height: size.height, transform: `scale(${scale})` }} onLoad={() => { setPreviewReady(true); send('glass:focus', { type, highlight }); }} /></div></div>
      <footer className={`gs-status ${error ? 'is-error' : ''}`} role="status">{error ? <span>!</span> : <Check size={15} />}<span>{message}</span><span className="gs-local">127.0.0.1 · 不对公网开放</span></footer>
    </section>
  </main>;
}
