import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import './CameraCapture.css';

interface CameraCaptureProps {
  onImageSend?: (imageData: string) => void;
  autoOpen?: boolean;
}

interface FaceOrientationData {
  isFacingForward: boolean;
  confidence: number;
  message: string;
  isMasked: boolean;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onImageSend, autoOpen = false }) => {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isAccessingCamera, setIsAccessingCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceOrientation, setFaceOrientation] = useState<FaceOrientationData>({
    isFacingForward: false,
    confidence: 0,
    message: 'カメラの前に正面を向いてください',
    isMasked: false,
  });
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load Face-api.js models
  const loadModels = useCallback(async () => {
    try {
      console.log('🔄 Loading Face-api.js models...');
      
      // Try multiple CDN sources
      const MODEL_URLS = [
        'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights',
        'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights',
        './models' // Local fallback
      ];
      
      let modelsLoaded = false;
      
      for (const MODEL_URL of MODEL_URLS) {
        try {
          console.log(`Trying to load models from: ${MODEL_URL}`);
          
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
          ]);
          
          console.log('✅ Face-api.js models loaded successfully');
          setIsModelLoaded(true);
          modelsLoaded = true;
          break;
        } catch (urlError) {
          console.warn(`Failed to load from ${MODEL_URL}:`, urlError);
          continue;
        }
      }
      
      if (!modelsLoaded) {
        throw new Error('All model loading attempts failed');
      }
    } catch (error) {
      console.error('❌ Failed to load Face-api.js models:', error);
      setCameraError('顔認識モデルの読み込みに失敗しました。インターネット接続を確認してください。');
    }
  }, []);

  // Simplified face detection - only runs when manually checking
  const checkFaceForCapture = useCallback(async (): Promise<boolean> => {
    if (!videoRef.current || !canvasRef.current || !isModelLoaded) {
      return false;
    }

    const video = videoRef.current;

    try {
      // Detect face with relaxed settings for capture
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ 
          inputSize: 320, // Standard resolution
          scoreThreshold: 0.5 // Relaxed threshold for capture
        }))
        .withFaceLandmarks();

      if (detection) {
        const orientation = analyzeStrictFaceOrientation(detection, video.videoWidth, video.videoHeight);
        
        console.log('Face analysis completed:', {
          isFacingForward: orientation.isFacingForward,
          isMasked: orientation.isMasked,
          confidence: orientation.confidence,
          message: orientation.message
        });
        
        return orientation.isFacingForward;
      } else {
        console.log('No face detected');
        return false;
      }
    } catch (error) {
      console.error('Face detection error:', error);
      return false;
    }
  }, [isModelLoaded]);

  // Balanced face orientation analysis - strict on forward-facing, relaxed on other aspects
  const analyzeStrictFaceOrientation = (detection: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection; }, faceapi.FaceLandmarks68>, canvasWidth: number, canvasHeight: number): FaceOrientationData => {
    const landmarks = detection.landmarks;
    const faceBox = detection.detection.box;
    
    // Get key facial points
    const nose = landmarks.getNose();
    const mouth = landmarks.getMouth();
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const jaw = landmarks.getJawOutline();

    // Enhanced mouth visibility check
    const noseTip = nose[3]; // Bottom of nose
    const mouthTop = mouth[3]; // Top lip center
    const mouthBottom = mouth[9]; // Bottom lip center
    const mouthLeft = mouth[0]; // Left corner
    const mouthRight = mouth[6]; // Right corner
    
    // Calculate mouth dimensions
    const mouthHeight = Math.abs(mouthBottom.y - mouthTop.y);
    const mouthWidth = Math.abs(mouthRight.x - mouthLeft.x);
    const noseToMouthDistance = Math.abs(mouthTop.y - noseTip.y);
    
    // Relaxed proportions for mouth visibility
    const expectedNoseToMouthRatio = 0.25; // More relaxed mouth position
    const chinPoint = jaw[8]; // Bottom of chin
    const noseToChinDistance = Math.abs(chinPoint.y - noseTip.y);
    const expectedMouthHeight = noseToChinDistance * 0.12; // More relaxed mouth height requirement
    const expectedMouthWidth = faceBox.width * 0.18; // More relaxed mouth width requirement
    
    // Relaxed mouth visibility checks
    const isMouthHeightAdequate = mouthHeight >= expectedMouthHeight;
    const isMouthWidthAdequate = mouthWidth >= expectedMouthWidth;
    const isNoseToMouthDistanceNormal = noseToMouthDistance >= (noseToChinDistance * expectedNoseToMouthRatio);
    
    // Check if mouth landmarks are properly distributed (not clustered due to occlusion)
    const mouthLandmarkSpread = Math.max(
      Math.abs(mouthRight.x - mouthLeft.x),
      Math.abs(mouthBottom.y - mouthTop.y)
    );
    const isNotOccluded = mouthLandmarkSpread > (faceBox.width * 0.12); // More relaxed occlusion check
    
    // Check for hand/object covering mouth area
    // If mouth landmarks are detected but dimensions are too small, likely covered
    const isMouthVisible = isMouthHeightAdequate && isMouthWidthAdequate && 
                          isNoseToMouthDistanceNormal && isNotOccluded;
    
    const isMasked = !isMouthVisible;
    
    // Calculate face center
    const faceCenter = {
      x: faceBox.x + faceBox.width / 2,
      y: faceBox.y + faceBox.height / 2
    };
    
    // Get nose tip (center point of nose)
    
    // Calculate horizontal offset of nose from face center
    const noseOffset = Math.abs(noseTip.x - faceCenter.x);
    const faceWidth = faceBox.width;
    const relativeNoseOffset = noseOffset / faceWidth;
    
    // Calculate eye positions
    const leftEyeCenter = leftEye.reduce((acc, point) => ({ 
      x: acc.x + point.x, 
      y: acc.y + point.y 
    }), { x: 0, y: 0 });
    leftEyeCenter.x /= leftEye.length;
    leftEyeCenter.y /= leftEye.length;
    
    const rightEyeCenter = rightEye.reduce((acc, point) => ({ 
      x: acc.x + point.x, 
      y: acc.y + point.y 
    }), { x: 0, y: 0 });
    rightEyeCenter.x /= rightEye.length;
    rightEyeCenter.y /= rightEye.length;
    
    const eyeDistance = Math.abs(rightEyeCenter.x - leftEyeCenter.x);
    const eyeVerticalDiff = Math.abs(rightEyeCenter.y - leftEyeCenter.y);
    const eyeAlignment = eyeVerticalDiff / eyeDistance;
    
    // Check if both eyes are reasonably visible (not strict profile view)
    const leftEyeVisible = leftEye.filter(point => 
      point.x > 5 && point.x < canvasWidth - 5 && 
      point.y > 5 && point.y < canvasHeight - 5
    ).length >= leftEye.length * 0.7; // 70% of eye points visible
    
    const rightEyeVisible = rightEye.filter(point => 
      point.x > 5 && point.x < canvasWidth - 5 && 
      point.y > 5 && point.y < canvasHeight - 5
    ).length >= rightEye.length * 0.7; // 70% of eye points visible
    
    const eyesVisibleInFrame = leftEyeVisible && rightEyeVisible;
    
    // Detection confidence from Face-api.js
    const detectionConfidence = detection.detection.score;
    
    // Balanced thresholds - strict on forward-facing, relaxed on other aspects
    const NOSE_OFFSET_THRESHOLD = 0.18; // More strict on forward-facing (not sideways)
    const EYE_ALIGNMENT_THRESHOLD = 0.25; // Relaxed eye alignment
    const MIN_CONFIDENCE = 0.5; // Lower confidence threshold
    const MIN_FACE_SIZE = 80; // Smaller minimum face size
    const MIN_EYE_DISTANCE = 25; // Smaller minimum distance between eyes
    
    // Conditions check
    const isNoseCentered = relativeNoseOffset < NOSE_OFFSET_THRESHOLD;
    const areEyesAligned = eyeAlignment < EYE_ALIGNMENT_THRESHOLD;
    const isConfident = detectionConfidence > MIN_CONFIDENCE;
    const isBigEnough = faceWidth > MIN_FACE_SIZE;
    const hasGoodEyeDistance = eyeDistance > MIN_EYE_DISTANCE;
    const areEyesVisible = eyesVisibleInFrame;
    const isMouthClearlyVisible = isMouthVisible; // New strict requirement
    
    // Overall confidence calculation
    let confidence = detectionConfidence;
    if (isNoseCentered) confidence += 0.1;
    if (areEyesAligned) confidence += 0.1;
    if (hasGoodEyeDistance) confidence += 0.1;
    if (areEyesVisible) confidence += 0.1;
    if (isMouthClearlyVisible) confidence += 0.15; // Higher weight for mouth visibility
    confidence = Math.min(confidence, 1.0);
    
    // BALANCED decision - Strict on forward-facing, relaxed on other aspects
    const criticalConditions = [isConfident, isBigEnough, areEyesVisible, isMouthClearlyVisible].filter(Boolean).length;
    const orientationConditions = [isNoseCentered, areEyesAligned, hasGoodEyeDistance].filter(Boolean).length;
    
    // Must have forward-facing (nose centered) + most other conditions
    const isFacingForward = isNoseCentered && criticalConditions >= 3 && orientationConditions >= 2;
    
    // Generate message with priority order
    let message = '';
    if (isMasked) {
      message = '手、マスク、物などを取り除いてください';
    } else if (!isBigEnough) {
      message = 'カメラに近づいてください';
    } else if (!isConfident) {
      message = '顔をもっとはっきりと映してください';
    } else if (!areEyesVisible) {
      message = '両目がはっきり見えるようにしてください';
    } else if (!isMouthClearlyVisible) {
      message = '口元がはっきり見えません';
    } else if (!hasGoodEyeDistance) {
      message = '正面を向いてください（横顔になっています）';
    } else if (!areEyesAligned) {
      message = '頭をまっすぐにしてください';
    } else if (!isNoseCentered) {
      message = 'もう少し正面を向いてください';
    } else {
      message = '正面を向いています - 撮影可能です';
    }
    
    return {
      isFacingForward,
      confidence,
      message,
      isMasked
    };
  };

  // Real-time face detection display
  const updateFaceDetection = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !isModelLoaded) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Always draw the video frame first
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      // Detect face with landmarks for display
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ 
          inputSize: 320,
          scoreThreshold: 0.5 // Slightly lower for display
        }))
        .withFaceLandmarks();

      if (detection) {
        // Analyze face orientation for display
        const orientation = analyzeStrictFaceOrientation(detection, canvas.width, canvas.height);
        setFaceOrientation(orientation);

        // Draw face detection overlay
        drawFaceOverlay(ctx, detection, orientation);
      } else {
        setFaceOrientation({
          isFacingForward: false,
          confidence: 0,
          message: '顔が検出されません',
          isMasked: false
        });
        
        // Draw center guidelines when no face detected
        drawCenterGuidelines(ctx, canvas.width, canvas.height);
      }
    } catch (error) {
      console.error('Face detection error:', error);
      setFaceOrientation({
        isFacingForward: false,
        confidence: 0,
        message: '顔認識エラー',
        isMasked: false
      });
      
      // Draw center guidelines on error
      drawCenterGuidelines(ctx, canvas.width, canvas.height);
    }
  }, [isModelLoaded]);

  // Draw center guidelines
  const drawCenterGuidelines = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    // Vertical center line
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
    
    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    
    ctx.setLineDash([]);
  };

  // Draw face detection overlay
  const drawFaceOverlay = (ctx: CanvasRenderingContext2D, detection: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection; }, faceapi.FaceLandmarks68>, orientation: FaceOrientationData) => {
    const box = detection.detection.box;
    const landmarks = detection.landmarks;
    
    // Set colors based on orientation
    const color = orientation.isFacingForward ? '#00ff00' : '#ff4444';
    const bgColor = orientation.isFacingForward ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 68, 68, 0.1)';
    
    // Draw face bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    
    // Fill face area
    ctx.fillStyle = bgColor;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    
    // Draw key landmarks
    ctx.fillStyle = color;
    
    // Draw nose
    const nose = landmarks.getNose();
    nose.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    // Draw eyes
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    [...leftEye, ...rightEye].forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    // Draw mouth/lips
    const mouth = landmarks.getMouth();
    mouth.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    // Draw jawline (lighter color)
    ctx.fillStyle = color === '#00ff00' ? 'rgba(0, 255, 0, 0.7)' : 'rgba(255, 68, 68, 0.7)';
    const jawline = landmarks.getJawOutline();
    jawline.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.5, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    // Draw center guidelines
    drawCenterGuidelines(ctx, ctx.canvas.width, ctx.canvas.height);
  };

  // Initialize
  useEffect(() => {
    loadModels();
    
    // Cleanup
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [loadModels]);

  // Auto-open camera
  useEffect(() => {
    if (autoOpen && !isAccessingCamera && !isCameraOpen && !capturedImage && isModelLoaded) {
      console.log("Auto-opening camera...");
      openCamera();
    }
  }, [autoOpen, isModelLoaded]);

  const openCamera = () => {
    setCameraError(null);
    setIsAccessingCamera(true);
  };

  const initializeCamera = async () => {
    try {
      console.log("Requesting camera access...");
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      
      console.log("Camera access granted, setting up video stream...");
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        videoRef.current.onloadedmetadata = async () => {
          console.log("Video metadata loaded, playing video...");
          if (videoRef.current && canvasRef.current) {
            try {
              await videoRef.current.play();
              console.log("Video is now playing");
              
              // Set canvas dimensions
              canvasRef.current.width = videoRef.current.videoWidth;
              canvasRef.current.height = videoRef.current.videoHeight;
              
              setIsCameraOpen(true);
              
              // Start real-time face detection (300ms for balanced performance)
              detectionIntervalRef.current = setInterval(updateFaceDetection, 300);
              
            } catch (err) {
              console.error("Error playing video:", err);
              setCameraError("Could not play video stream: " + (err as Error).message);
              setIsAccessingCamera(false);
            }
          }
        };
        
        setCapturedImage(null);
      } else {
        setCameraError("Video element not available");
        setIsAccessingCamera(false);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setCameraError(`Unable to access camera: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsAccessingCamera(false);
    }
  };

  // Initialize camera when accessing
  useEffect(() => {
    if (isAccessingCamera && videoRef.current && isModelLoaded) {
      initializeCamera();
    }
  }, [isAccessingCamera, isModelLoaded]);

  const captureImage = async () => {
    if (!videoRef.current || !isCameraOpen) {
      alert('カメラが利用できません');
      return;
    }

    // Check face orientation before capture
    const isFaceValid = await checkFaceForCapture();
    
    if (faceOrientation.isMasked) {
      alert('マスクを外してから撮影してください。');
      return;
    }

    if (!isFaceValid) {
      // More relaxed message and allow capture if confidence is reasonable
      if (faceOrientation.confidence > 0.3) {
        console.log('Face detection confidence is reasonable, allowing capture despite strict check');
        // Continue with capture even if strict check failed but confidence is reasonable
      } else {
        alert('顔をもう少しはっきりと映してください。\nカメラに近づくか、明るい場所で撮影してください。');
        return;
      }
    }

    // Capture the image
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL('image/jpeg');
      setCapturedImage(imageData);
      stopCamera();
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    setIsCameraOpen(false);
    setIsAccessingCamera(false);
    setFaceOrientation({
      isFacingForward: false,
      confidence: 0,
      message: 'カメラの前に正面を向いてください',
      isMasked: false
    });
  };

  const resetCapture = () => {
    setCapturedImage(null);
    openCamera();
  };

  const sendImage = () => {
    if (capturedImage && onImageSend) {
      onImageSend(capturedImage);
      alert('Image sent successfully!');
    } else {
      alert('Please capture an image first');
    }
  };

  return (
    <div className="camera-capture">
      {!isAccessingCamera && !capturedImage && (
        <button className="camera-button" onClick={openCamera} disabled={!isModelLoaded}>
          {isModelLoaded ? 'Open Camera' : 'Loading Face Detection...'}
        </button>
      )}

      {cameraError && (
        <div className="camera-error">
          <p>Error: {cameraError}</p>
          <p>Please make sure your browser has camera permissions enabled and try again.</p>
        </div>
      )}

      {(isAccessingCamera || isCameraOpen) && !capturedImage && (
        <div className="camera-container">
          <div className="video-wrapper">
            {!isCameraOpen && isAccessingCamera && (
              <div className="camera-loading">
                Accessing camera and loading face detection...
              </div>
            )}
            
            {/* Hidden video element */}
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted
              style={{ display: 'none' }}
            />
            
            {/* Canvas for video display */}
            <canvas 
              ref={canvasRef}
              className="face-detection-canvas"
              style={{ 
                display: 'block', 
                width: '100%', 
                height: 'auto', 
                backgroundColor: '#000',
                borderRadius: '8px'
              }}
            />
            
            {/* No Mask Allowed Icon */}
            <div className="no-mask-icon">
              <div className="mask-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/>
                </svg>
              </div>
              <div className="mask-text">マスク禁止</div>
            </div>
            
            {isCameraOpen && (
              <div className={`face-status-mini ${faceOrientation.isFacingForward && !faceOrientation.isMasked ? 'status-ready' : 'status-waiting'}`}>
                {faceOrientation.isFacingForward && !faceOrientation.isMasked ? '✓ 撮影可能' : faceOrientation.isMasked ? '⚠ マスクを外してください' : '⚠ 顔を確認中...'}
              </div>
            )}
          </div>
          
          {/* Status Information Below Camera */}
          {isCameraOpen && (
            <div className="camera-status-info">
              <div className="status-main">
                <span className={`status-icon ${faceOrientation.isFacingForward && !faceOrientation.isMasked ? 'ready' : 'waiting'}`}>
                  {faceOrientation.isFacingForward && !faceOrientation.isMasked ? '✓' : '⚠'}
                </span>
                <span className="status-text">
                  {faceOrientation.message}
                </span>
              </div>
              {/* <div className="status-details">
                信頼度: {Math.round(faceOrientation.confidence * 100)}% (Face-api.js)
              </div> */}
            </div>
          )}
          
          {/* Camera Controls - back to original position for desktop, will be repositioned via CSS on mobile */}
          <div className="camera-controls">
            <button 
              onClick={captureImage} 
              disabled={!isCameraOpen}
              className={isCameraOpen && !faceOrientation.isMasked ? 'capture-ready' : 'capture-disabled'}
            >
              撮影
            </button>
            <button onClick={stopCamera}>閉じる</button>
          </div>
        </div>
      )}

      {capturedImage && (
        <div className="preview-container">
          <h3>Preview Image</h3>
          <img src={capturedImage} alt="Captured" />
          <div className="preview-controls">
            <button onClick={resetCapture}>再撮影</button>
            <button onClick={sendImage}>送る</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraCapture; 