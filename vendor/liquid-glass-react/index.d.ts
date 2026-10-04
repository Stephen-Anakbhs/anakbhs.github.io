interface LiquidGlassProps {
    children: React.ReactNode;
    displacementScale?: number;
    blurAmount?: number;
    saturation?: number;
    aberrationIntensity?: number;
    elasticity?: number;
    cornerRadius?: number;
    globalMousePos?: {
        x: number;
        y: number;
    };
    mouseOffset?: {
        x: number;
        y: number;
    };
    mouseContainer?: React.RefObject<HTMLElement | null> | null;
    className?: string;
    padding?: string;
    style?: React.CSSProperties;
    overLight?: boolean;
    mode?: "standard" | "polar" | "prominent" | "shader";
    /** Returns a displacement map URL for the measured glass size; overrides `mode`. */
    displacementMap?: (width: number, height: number) => string;
    /** Rim highlight layers to render: 2 (upstream), 1 (overlay rim only) or 0. */
    rims?: 0 | 1 | 2;
    onClick?: () => void;
}
export default function LiquidGlass({ children, displacementScale, blurAmount, saturation, aberrationIntensity, elasticity, cornerRadius, globalMousePos: externalGlobalMousePos, mouseOffset: externalMouseOffset, mouseContainer, className, padding, overLight, style, mode, displacementMap, rims, onClick, }: LiquidGlassProps): import("react/jsx-runtime").JSX.Element;
export {};
