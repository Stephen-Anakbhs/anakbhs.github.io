import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export type PreviewImage = { src: string; alt: string };

export function ImageLightbox({ image, onClose }: { image: PreviewImage | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (image && !dialog.open) dialog.showModal();
    if (!image && dialog.open) dialog.close();
  }, [image]);

  return (
    <dialog
      className="image-lightbox"
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}
      aria-label={image ? `Enlarged image: ${image.alt}` : "Image preview"}
    >
      {image && (
        <>
          <button className="lightbox-close" type="button" onClick={onClose} aria-label="Close image preview" title="Close image preview">
            <X size={23} />
          </button>
          <img src={image.src} alt={image.alt} />
          <p>{image.alt}</p>
        </>
      )}
    </dialog>
  );
}
