"use client";

// Camera set-up for barcode scanning. Phones with several rear lenses often hand a web page
// the ultra-wide one, which can't focus up close; and people tend to hold the phone too near
// for any lens to focus. So: prefer the main rear lens, keep autofocus running, and zoom in a
// little so the barcode fills the box from a comfortable distance.

// Features some phones offer that the standard type definitions don't list yet.
type ExtraCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  zoom?: { min: number; max: number; step?: number };
  torch?: boolean;
};
type ExtraConstraints = MediaTrackConstraintSet & { focusMode?: string; zoom?: number; torch?: boolean };

const SCAN_ZOOM = 1.8;

export type CameraControls = {
  stream: MediaStream;
  canTorch: boolean;
  setTorch: (on: boolean) => Promise<void>;
  refocus: () => Promise<void>;
  stop: () => void;
};

// Rear cameras by likely usefulness: the main lens first, ultra-wide and telephoto last.
export function rankRearCameras(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  const rear = devices.filter((d) => d.kind === "videoinput" && !/front|user|facetime/i.test(d.label));
  const score = (label: string) =>
    /ultra|wide|0\.5/i.test(label) ? 2 : /tele|zoom|macro|depth/i.test(label) ? 1 : 0;
  return [...rear].sort((a, b) => score(a.label) - score(b.label));
}

function capabilities(track: MediaStreamTrack): ExtraCapabilities {
  try {
    return (track.getCapabilities?.() ?? {}) as ExtraCapabilities;
  } catch {
    return {};
  }
}

async function apply(track: MediaStreamTrack, set: ExtraConstraints) {
  try {
    await track.applyConstraints({ advanced: [set] });
  } catch {
    // Not supported on this phone: carry on without it.
  }
}

export async function openCamera(deviceId?: string): Promise<CameraControls> {
  const video: MediaTrackConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }),
  };
  const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
  const track = stream.getVideoTracks()[0];
  const caps = capabilities(track);

  if (caps.focusMode?.includes("continuous")) await apply(track, { focusMode: "continuous" });
  if (caps.zoom && caps.zoom.max > 1) await apply(track, { zoom: Math.min(SCAN_ZOOM, caps.zoom.max) });

  return {
    stream,
    canTorch: Boolean(caps.torch),
    setTorch: (on) => apply(track, { torch: on }),
    // A tap on the picture: focus once on what's there, then go back to following it.
    refocus: async () => {
      if (caps.focusMode?.includes("single-shot")) {
        await apply(track, { focusMode: "single-shot" });
        if (caps.focusMode.includes("continuous")) setTimeout(() => void apply(track, { focusMode: "continuous" }), 1200);
      }
    },
    stop: () => stream.getTracks().forEach((t) => t.stop()),
  };
}

// Android's built-in barcode reader: quicker and better with blur and glare than the
// JavaScript one, which remains for iPhones and anything else without it.
type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorClass = {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats: () => Promise<string[]>;
};

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

export async function nativeDetector(): Promise<Detector | null> {
  const Native = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (!Native) return null;
  try {
    const supported = await Native.getSupportedFormats();
    const formats = FORMATS.filter((f) => supported.includes(f));
    return formats.includes("ean_13") ? new Native({ formats }) : null;
  } catch {
    return null;
  }
}
