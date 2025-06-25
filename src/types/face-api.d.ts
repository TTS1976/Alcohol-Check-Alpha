declare module 'face-api.js' {
  export interface Point {
    x: number;
    y: number;
  }

  export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface FaceDetection {
    box: Box;
    score: number;
  }

  export interface FaceLandmarks68 {
    positions: Point[];
    getNose(): Point[];
    getLeftEye(): Point[];
    getRightEye(): Point[];
    getMouth(): Point[];
    getJawOutline(): Point[];
  }

  export interface WithFaceLandmarks<T, L> {
    detection: T['detection'];
    landmarks: L;
  }

  export class TinyFaceDetectorOptions {
    constructor(options?: { inputSize?: number; scoreThreshold?: number });
  }

  export const nets: {
    tinyFaceDetector: {
      loadFromUri(uri: string): Promise<void>;
    };
    faceLandmark68Net: {
      loadFromUri(uri: string): Promise<void>;
    };
    faceRecognitionNet: {
      loadFromUri(uri: string): Promise<void>;
    };
  };

  export function detectSingleFace(
    input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    options?: TinyFaceDetectorOptions
  ): {
    withFaceLandmarks(): Promise<WithFaceLandmarks<{ detection: FaceDetection }, FaceLandmarks68> | null>;
  };
} 