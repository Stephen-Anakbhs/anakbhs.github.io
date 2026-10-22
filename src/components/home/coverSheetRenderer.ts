// WebGL glass sheet with one open edge: clear glass that bends what lies under it into its rim,
// splits the colors slightly and catches light. The hero cover draws it over the hero video
// (the hero's shade fades out of the glass as it lifts, so with the glass at 0 and the edge at
// the bottom it draws exactly what the hero shows at rest); the sheet that comes back down over
// a page draws it over a snapshot of that page, leaving everything below its edge see-through.
export type CoverSource = HTMLVideoElement | HTMLCanvasElement | HTMLImageElement;

export type CoverLayout = {
  width: number; // sheet size, CSS px
  height: number;
  scale: number; // device px per CSS px
  radius: number; // lower corner radius; 0 keeps the sheet square
  source: CoverSource | null;
  cover: [number, number, number, number]; // where the source sits in the sheet, CSS px
  live: boolean; // re-upload the source every frame (video, animating canvas)
  shade: [number, number, number]; // hero shade opacity at 0%, 62% and 100% across
  seeThrough: boolean; // below the edge: transparent (a page beneath) instead of the source
};

const VERTEX = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

const FRAGMENT = `
precision highp float;
uniform sampler2D u_source;
uniform float u_hasSource;
uniform vec2 u_size;
uniform vec2 u_scale;
uniform float u_buffer;
uniform vec4 u_cover;
uniform vec3 u_shade;
uniform float u_seeThrough;
uniform float u_edge;
uniform float u_glass;
uniform float u_clear;
uniform float u_radius;
uniform float u_overhang;
uniform float u_bevel;

const vec3 SHADE = vec3(0.0196, 0.0314, 0.0392);
const vec2 LIGHT = vec2(-0.55, 0.835);

vec3 sampleSource(vec2 p) {
  vec2 uv = clamp((p - u_cover.xy) / u_cover.zw, 0.0, 1.0);
  return mix(SHADE, texture2D(u_source, uv).rgb, u_hasSource);
}

float heroShade(float x) {
  float t = clamp(x / u_size.x, 0.0, 1.0);
  return t < 0.62 ? mix(u_shade.x, u_shade.y, t / 0.62) : mix(u_shade.y, u_shade.z, (t - 0.62) / 0.38);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_buffer - gl_FragCoord.y) / u_scale;

  // Signed distance to the sheet: full width (its sides pushed off screen when the corners are
  // square), open at the top, the lower corners rounded by u_radius.
  float r = u_radius;
  vec2 q = vec2(abs(p.x - u_size.x * 0.5) - u_size.x * 0.5 - u_overhang + r, p.y - u_edge + r);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  float side = p.x < u_size.x * 0.5 ? -1.0 : 1.0;
  vec2 normal = q.x > 0.0 && q.y > 0.0 ? normalize(q) * vec2(side, 1.0) : (q.x > q.y ? vec2(side, 0.0) : vec2(0.0, 1.0));

  // Below the edge: the source as it is, or nothing, under the soft shadow of the sheet.
  float shadow = 0.28 * u_glass * exp(-max(d, 0.0) / 14.0);
  vec4 below = mix(vec4(sampleSource(p) * (1.0 - shadow), 1.0), vec4(0.0, 0.0, 0.0, shadow), u_seeThrough);

  // The sheet: near the edge the glass curves away, so it shows the source from just beyond the
  // edge, compressed. The hero's shade thins out as the glass clears, leaving a faint frost.
  float rim = 1.0 - clamp(-d / u_bevel, 0.0, 1.0);
  float g = u_glass * smoothstep(u_edge - r - 2.0 * u_bevel, u_edge - r, p.y);
  float bend = 1.0 - sqrt(max(0.0, 1.0 - rim * rim));
  vec2 shift = normal * (u_bevel * 1.3 * bend * g);
  vec3 bent = vec3(sampleSource(p + shift * 1.1).r, sampleSource(p + shift).g, sampleSource(p + shift * 0.9).b);
  vec3 sheet = mix(bent, SHADE, heroShade(p.x) * (1.0 - u_clear) * (1.0 - bend * g));
  sheet = mix(sheet, vec3(1.0), 0.07 * u_clear);
  float light = 0.3 + 0.7 * abs(dot(normal, LIGHT));
  sheet += g * (0.05 * rim + 0.5 * pow(rim, 6.0) * light);

  float covered = clamp(0.5 - d * u_scale.y, 0.0, 1.0);
  gl_FragColor = mix(below, vec4(sheet, 1.0), covered);
}`;

/** Where a source sits inside a box with object-fit: cover and its object-position. */
export function coverBox(source: CoverSource, width: number, height: number): [number, number, number, number] {
  const [naturalWidth, naturalHeight] = source instanceof HTMLVideoElement ? [source.videoWidth, source.videoHeight]
    : source instanceof HTMLImageElement ? [source.naturalWidth, source.naturalHeight] : [source.width, source.height];
  const scale = Math.max(width / (naturalWidth || width), height / (naturalHeight || height));
  const drawnWidth = (naturalWidth || width) * scale;
  const drawnHeight = (naturalHeight || height) * scale;
  const [x, y] = getComputedStyle(source).objectPosition.split(" ").map((value) => value.endsWith("%") ? parseFloat(value) / 100 : 0.5);
  return [(width - drawnWidth) * (x ?? 0.5), (height - drawnHeight) * (y ?? 0.5), drawnWidth, drawnHeight];
}

// One renderer per canvas: a canvas keeps its WebGL context for life, so a second request for
// the same canvas (React remounting the hero) must get the renderer already on it.
const renderers = new WeakMap<HTMLCanvasElement, CoverRenderer>();

export function createCoverRenderer(canvas: HTMLCanvasElement) {
  const existing = renderers.get(canvas);
  if (existing && !existing.lost) return existing;
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }) as WebGLRenderingContext | null;
  if (!gl || gl.isContextLost()) return null;
  const compile = (type: number, text: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, text);
    gl.compileShader(shader);
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const at = (name: string) => gl.getUniformLocation(program, name);
  const uniforms = {
    hasSource: at("u_hasSource"), size: at("u_size"), scale: at("u_scale"), buffer: at("u_buffer"), cover: at("u_cover"), shade: at("u_shade"),
    seeThrough: at("u_seeThrough"), edge: at("u_edge"), glass: at("u_glass"), clear: at("u_clear"), radius: at("u_radius"), overhang: at("u_overhang"),
    bevel: at("u_bevel"),
  };
  let layout: CoverLayout | null = null;
  let uploaded: CoverSource | null = null;
  let lost = false;
  canvas.addEventListener("webglcontextlost", () => { lost = true; });

  const renderer: CoverRenderer = {
    get lost() { return lost; },
    layout(next: CoverLayout) {
      layout = next;
      uploaded = null;
      const width = Math.max(1, Math.round(next.width * next.scale));
      const height = Math.max(1, Math.round(next.height * next.scale));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniforms.size, next.width, next.height);
      gl.uniform2f(uniforms.scale, width / next.width, height / next.height);
      gl.uniform1f(uniforms.buffer, height);
      gl.uniform3f(uniforms.shade, ...next.shade);
      gl.uniform1f(uniforms.seeThrough, next.seeThrough ? 1 : 0);
      gl.uniform4f(uniforms.cover, ...next.cover);
      const bevel = Math.min(32, Math.max(20, next.width * 0.024));
      gl.uniform1f(uniforms.bevel, bevel);
      gl.uniform1f(uniforms.radius, next.radius);
      gl.uniform1f(uniforms.overhang, next.radius > 0 ? 0 : bevel * 3);
    },
    draw(edge: number, glass: number, clear: number) {
      if (lost || !layout) return false;
      const source = layout.source;
      if (source && (uploaded !== source || layout.live)) {
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
          uploaded = source;
        } catch {
          layout.source = null; // an unreadable frame leaves the shade alone
        }
      }
      gl.uniform1f(uniforms.hasSource, layout.source ? 1 : 0);
      gl.uniform1f(uniforms.edge, edge);
      gl.uniform1f(uniforms.glass, glass);
      gl.uniform1f(uniforms.clear, clear);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    },
  };
  renderers.set(canvas, renderer);
  return renderer;
}

export type CoverRenderer = {
  readonly lost: boolean;
  layout(next: CoverLayout): void;
  draw(edge: number, glass: number, clear: number): boolean;
};
