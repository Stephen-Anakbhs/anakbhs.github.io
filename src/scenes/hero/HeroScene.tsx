import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function ParticleField() {
  const pointsRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const values = new Float32Array(110 * 3);
    let seed = 2317;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    for (let index = 0; index < 110; index += 1) {
      values[index * 3] = (random() - 0.5) * 9;
      values[index * 3 + 1] = (random() - 0.5) * 5.8;
      values[index * 3 + 2] = (random() - 0.5) * 2;
    }

    return values;
  }, []);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y += delta * 0.003;
    pointsRef.current.rotation.x = state.pointer.y * 0.015;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.019} transparent opacity={0.38} sizeAttenuation depthWrite={false} />
    </points>
  );
}

export function HeroScene() {
  return (
    <div className="hero-scene" aria-hidden="true">
      <Canvas dpr={[1, 1.5]} gl={{ alpha: true, antialias: true, powerPreference: "low-power" }} camera={{ position: [0, 0, 5.5], fov: 45 }}>
        <ParticleField />
      </Canvas>
    </div>
  );
}
