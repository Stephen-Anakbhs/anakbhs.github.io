param(
  [Parameter(Mandatory)][string]$Source,
  [Parameter(Mandatory)][string]$Destination,
  [ValidateSet('white', 'charcoal')][string]$Background = 'white',
  [switch]$ExteriorOnly,
  [switch]$CropOnly
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;

public static class LogoCutout {
  public static string Process(string source, string destination, bool dark, bool exteriorOnly, bool cropOnly) {
    using (var input = new Bitmap(source)) {
      int width = input.Width, height = input.Height;
      var pixels = new Color[width * height];
      var distances = new int[pixels.Length];
      var background = new bool[pixels.Length];
      int low = dark ? 2 : 5, high = dark ? 14 : 17;
      for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
          int i = y * width + x;
          Color c = input.GetPixel(x, y);
          pixels[i] = c;
          distances[i] = Math.Max(Math.Abs(c.R - (dark ? 38 : 255)),
            Math.Max(Math.Abs(c.G - (dark ? 40 : 255)), Math.Abs(c.B - (dark ? 41 : 255))));
          background[i] = !exteriorOnly;
        }
      }

      // A border-connected mask preserves the seal's white interior lettering.
      if (exteriorOnly) {
        var queue = new Queue<int>();
        Action<int> visit = i => {
          if (!background[i] && distances[i] <= high) {
            background[i] = true;
            queue.Enqueue(i);
          }
        };
        for (int x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
        for (int y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
        while (queue.Count > 0) {
          int i = queue.Dequeue(), x = i % width, y = i / width;
          if (x > 0) visit(i - 1);
          if (x + 1 < width) visit(i + 1);
          if (y > 0) visit(i - width);
          if (y + 1 < height) visit(i + width);
        }
      }

      int left = width, top = height, right = -1, bottom = -1;
      using (var cutout = new Bitmap(width, height, PixelFormat.Format32bppArgb)) {
        for (int y = 0; y < height; y++) {
          for (int x = 0; x < width; x++) {
            int i = y * width + x;
            Color c = pixels[i];
            int alpha = c.A;
            if (!cropOnly && background[i]) {
              alpha = (int)Math.Round(c.A * Math.Clamp((distances[i] - low) / (double)(high - low), 0, 1));
            }
            cutout.SetPixel(x, y, Color.FromArgb(alpha, c.R, c.G, c.B));
            if (alpha > 0) {
              left = Math.Min(left, x); top = Math.Min(top, y);
              right = Math.Max(right, x); bottom = Math.Max(bottom, y);
            }
          }
        }
        if (right < left) throw new InvalidOperationException("No foreground pixels remain.");
        left = Math.Max(0, left - 3); top = Math.Max(0, top - 3);
        right = Math.Min(width - 1, right + 3); bottom = Math.Min(height - 1, bottom + 3);
        var crop = new Rectangle(left, top, right - left + 1, bottom - top + 1);
        using (var output = cutout.Clone(crop, PixelFormat.Format32bppArgb)) {
          int changedRgb = 0;
          for (int y = 0; y < output.Height; y++) {
            for (int x = 0; x < output.Width; x++) {
              Color a = output.GetPixel(x, y), b = input.GetPixel(x + left, y + top);
              if (a.A > 0 && (a.R != b.R || a.G != b.G || a.B != b.B)) changedRgb++;
              if (cropOnly && a.A != b.A) throw new InvalidOperationException("Source alpha changed.");
            }
          }
          if (changedRgb != 0) throw new InvalidOperationException("Foreground RGB pixels changed.");
          output.Save(destination, ImageFormat.Png);
          return String.Format("{0}: {1}x{2} -> {3}x{4}; crop ({5},{6}); {7}; no resizing or redrawing", destination, width, height, output.Width, output.Height, left, top,
            cropOnly ? "original RGB and alpha preserved" : "RGB changes=0");
        }
      }
    }
  }
}
'@ -ReferencedAssemblies System.Drawing.Common,System.Drawing.Primitives,System.Private.Windows.GdiPlus,System.Private.Windows.Core,System.Runtime,System.Collections

[LogoCutout]::Process($Source, $Destination, $Background -eq 'charcoal', $ExteriorOnly.IsPresent, $CropOnly.IsPresent)
