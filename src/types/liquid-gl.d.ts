declare module "liquid-gl" {
  export interface LiquidLens {
    options: { frost: number; aberration: number };
    renderer: {
      _videoNodes: (HTMLVideoElement | HTMLImageElement | HTMLCanvasElement)[];
      suspended: boolean;
      invalidate(duration?: number): void;
      setSuspended(value: boolean): void;
      render(): void;
      captureSnapshot(): Promise<boolean | void>;
    } | null;
    setTint(value: string): void;
    destroy(): void;
  }
  interface LiquidOptions {
    target: string;
    snapshot: string;
    content: string | false;
    resolution: number;
    frameloop?: "always" | "demand";
    refraction: number;
    aberration: number;
    bevelDepth: number;
    bevelWidth: number;
    frost: number;
    shadow: boolean;
    specular: boolean;
    reveal: "none";
    tilt: boolean;
    interaction: "fluid" | "none";
    interactionStrength: number;
    interactionRadius: number;
    interactionViscosity: number;
    magnify: number;
    tint: string;
    zIndex: number;
  }
  const liquidGL: (options: LiquidOptions) => LiquidLens | LiquidLens[] | undefined;
  export default liquidGL;
}
