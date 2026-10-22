declare module "liquid-gl" {
  export interface LiquidLens {
    options: { frost: number; aberration: number; shadow: boolean };
    renderer: {
      _videoNodes: (HTMLVideoElement | HTMLImageElement | HTMLCanvasElement)[];
      suspended: boolean;
      invalidate(duration?: number): void;
      setSuspended(value: boolean): void;
      render(): void;
      captureSnapshot(): Promise<boolean | void>;
    } | null;
    setTint(value: string): void;
    setShadow(enabled: boolean): void;
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
  interface RasteriseOptions {
    width?: number;
    height?: number;
    scale?: number;
    budgetMs?: number;
    backgroundColor?: string | null;
    ignoreElements?: (element: Element) => boolean;
  }
  const liquidGL: {
    (options: LiquidOptions): LiquidLens | LiquidLens[] | undefined;
    /** Paints an element into a canvas in CSS-pixel document space, in main-thread slices. */
    rasterise(element: Element, options?: RasteriseOptions): Promise<HTMLCanvasElement>;
    /** The two halves of rasterise: a synchronous measure of the element, then chunked painting. */
    painter: {
      measure(element: Element, options?: RasteriseOptions): PaintPlan | null;
      paint(plan: PaintPlan, canvas: HTMLCanvasElement): HTMLCanvasElement;
      paintChunked(plan: PaintPlan, canvas: HTMLCanvasElement, budgetMs?: number): Promise<HTMLCanvasElement>;
    };
  };
  /** What measure() found: ops in document CSS px, `base` mapping them onto a `width` x `height` canvas. */
  interface PaintPlan { assets: Promise<unknown>[]; base: number[]; width: number; height: number; scale: number }
  export default liquidGL;
}
