import React, { useState, useRef, useEffect } from 'react';
import './CameraCapture.css';

interface CameraCaptureProps {
  onImageSend?: (imageData: string) => void;
  autoOpen?: boolean;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onImageSend, autoOpen = false }) => {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isAccessingCamera, setIsAccessingCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Cleanup function to stop camera when component unmounts
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Auto-open camera when component mounts if autoOpen is true
  useEffect(() => {
    if (autoOpen && !isAccessingCamera && !isCameraOpen && !capturedImage) {
      console.log("Auto-opening camera...");
      openCamera();
    }
  }, [autoOpen]);

  // This effect will run after the video element is rendered
  useEffect(() => {
    if (isAccessingCamera && videoRef.current) {
      initializeCamera();
    }
  }, [isAccessingCamera]);

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
        
        // Make sure video starts playing
        videoRef.current.onloadedmetadata = () => {
          console.log("Video metadata loaded, playing video...");
          if (videoRef.current) {
            videoRef.current.play()
              .then(() => {
                console.log("Video is now playing");
                setIsCameraOpen(true);
              })
              .catch(err => {
                console.error("Error playing video:", err);
                setCameraError("Could not play video stream: " + err.message);
                setIsAccessingCamera(false);
              });
          }
        };
        
        setCapturedImage(null);
      } else {
        console.error("Video reference is not available");
        setCameraError("Video element not available");
        setIsAccessingCamera(false);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setCameraError(`Unable to access camera: ${error instanceof Error ? error.message : 'Unknown error'}`);
      alert('Unable to access camera. Please ensure you have given permission.');
      setIsAccessingCamera(false);
    }
  };

  const captureImage = () => {
    if (videoRef.current && isCameraOpen) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg');
        setCapturedImage(imageData);
        // After capturing, stop the camera stream to save resources
        stopCamera();
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setIsCameraOpen(false);
      setIsAccessingCamera(false);
    }
  };

  const resetCapture = () => {
    setCapturedImage(null);
    openCamera();
  };

  const sendImage = () => {
    if (capturedImage && onImageSend) {
      onImageSend(capturedImage);
      alert('Image sent successfully!');
      // Reset after sending
      setCapturedImage(null);
    } else {
      alert('Please capture an image first');
    }
  };

  return (
    <div className="camera-capture">
      {!isAccessingCamera && !capturedImage && (
        <button className="camera-button" onClick={openCamera}>
          Open Camera
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
              <div className="camera-loading">Accessing camera...</div>
            )}
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted
              style={{ display: 'block', width: '100%', height: 'auto', backgroundColor: '#000' }}
            />
            {isCameraOpen && (
              <div className="camera-status">Camera active</div>
            )}
          </div>
          <div className="camera-controls">
            <button onClick={captureImage} disabled={!isCameraOpen}>撮影</button>
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