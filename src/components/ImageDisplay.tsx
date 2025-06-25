import React, { useState, useEffect } from 'react';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { fetchAuthSession } from 'aws-amplify/auth'; // Re-enable for guest credentials

interface ImageDisplayProps {
  fileName: string;
}

export const ImageDisplay: React.FC<ImageDisplayProps> = ({ fileName }) => {
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    downloadImage();
  }, [fileName]);

  // Add keyboard event listener for ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        closeModal();
      }
    };

    if (isModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen]);

  const downloadImage = async () => {
    if (!fileName) return;

    setLoading(true);
    setError(null);

    try {
      // Get AWS credentials (works for both authenticated and unauthenticated users)
      const session = await fetchAuthSession();
      const credentials = session.credentials;

      if (!credentials) {
        throw new Error('No AWS credentials available');
      }

      // Create Lambda client with credentials
      const lambdaClient = new LambdaClient({
        region: 'ap-northeast-1',
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
      });

      // Invoke DirectCloud download Lambda function
      const command = new InvokeCommand({
          FunctionName: 'amplify-dr602xvcmh1os-mai-directclouddownloadlambd-NbekozPO2WEQ', //production
          //FunctionName: 'amplify-amplifyvitereactt-directclouddownloadlambd-aPw4nKclFnMd', //staging
        Payload: JSON.stringify({
          fileName: fileName
        }),
      });

      console.log('Invoking DirectCloud download Lambda function...');
      const response = await lambdaClient.send(command);
      console.log('Lambda response:', response);

      if (response.StatusCode === 200 && response.Payload) {
        const payload = JSON.parse(new TextDecoder().decode(response.Payload));
        console.log('Raw payload:', payload);
        
        // Parse the stringified body - THIS IS THE KEY FIX
        const body = JSON.parse(payload.body);
        console.log('Parsed body:', body);

        if (body.success && body.data) {
          const imageUrl = `data:${body.contentType || 'image/jpeg'};base64,${body.data}`;
          console.log('Constructed image URL:', imageUrl.slice(0, 100) + '...'); // Log partial URL
          setImageData(imageUrl);
        } else {
          setError(body.error || 'No image data received');
        }
      } else {
        throw new Error(`Lambda invocation failed with status: ${response.StatusCode}`);
      }
    } catch (error) {
      console.error('Download error:', error);
      setError('Failed to download image - この機能は一時的に制限されています');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleModalClick = (e: React.MouseEvent) => {
    // Close modal if clicking on the backdrop (not the image)
    if (e.target === e.currentTarget) {
      closeModal();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-100 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">画像を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 bg-red-50 rounded-lg border border-red-200">
        <div className="text-center text-red-600">
          <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm">エラー: {error}</p>
        </div>
      </div>
    );
  }

  if (!imageData) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-100 rounded-lg">
        <div className="text-center text-gray-500">
          <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm">画像データがありません</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Thumbnail */}
      <div className="relative group">
        <img
          src={imageData}
          alt="アルコール検査画像"
          className="w-full h-48 object-cover rounded-lg cursor-pointer transition-all duration-200 hover:opacity-80 hover:scale-105"
          onClick={openModal}
        />
        {/* Overlay with zoom icon */}
        <div 
          className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 rounded-lg flex items-center justify-center cursor-pointer"
          onClick={openModal}
        >
          <svg 
            className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
        </div>
        {/* Click to enlarge text */}
        <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          クリックで拡大
        </div>
      </div>
      
      {/* File name */}
      <p className="text-xs text-gray-500 mt-2 truncate" title={fileName}>
        ファイル名: {fileName}
      </p>

      {/* Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999] p-4"
          onClick={handleModalClick}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <div className="relative flex items-center justify-center w-full h-full">
            {/* Close button */}
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 transition-all duration-200 z-10"
              style={{ zIndex: 10000 }}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Full size image - centered */}
            <img
              src={imageData}
              alt="アルコール検査画像 (拡大表示)"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              style={{ 
                maxHeight: '90vh', 
                maxWidth: '90vw',
                display: 'block',
                margin: 'auto'
              }}
            />
            
            {/* Image info */}
            <div className="absolute bottom-4 left-4 bg-black bg-opacity-60 text-white px-3 py-2 rounded">
              <p className="text-sm">{fileName}</p>
              <p className="text-xs opacity-75">ESCキーまたは背景をクリックして閉じる</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ImageDisplay; 