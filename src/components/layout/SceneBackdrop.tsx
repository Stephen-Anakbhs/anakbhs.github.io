import { useEffect, useState } from "react";
import { useScene, type Scene } from "../../content/scenes";

// The fixed wallpaper. A new scene fades in over the previous one, which is dropped once covered.
export function SceneBackdrop() {
  const scene = useScene();
  const [layers, setLayers] = useState<Scene[]>([scene]);
  useEffect(() => {
    setLayers((current) => current[current.length - 1]?.id === scene.id ? current : [...current.slice(-1), scene]);
  }, [scene]);
  return (
    <div className="site-backdrop" aria-hidden="true">
      {layers.map((layer, index) => (
        <div key={layer.id} className="backdrop-layer" data-entering={index > 0 ? "" : undefined}
          onAnimationEnd={(event) => { if (event.target === event.currentTarget) setLayers((current) => current.slice(-1)); }}>
          <img src={layer.image} alt="" fetchPriority={index === 0 ? "high" : undefined} />
          <img className="backdrop-calm" src={layer.calm ?? layer.image} data-derived={layer.calm ? undefined : ""} alt="" />
        </div>
      ))}
    </div>
  );
}
