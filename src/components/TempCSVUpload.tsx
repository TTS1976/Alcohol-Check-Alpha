import React, { useState } from 'react';
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";

// Configure client to use API key for public access
const client = generateClient<Schema>({
  authMode: 'apiKey'
});

interface TempCSVUploadProps {
  onBack?: () => void;
}

const TempCSVUpload: React.FC<TempCSVUploadProps> = ({ onBack }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      setUploadStatus('');
      setErrors([]);
    } else {
      setUploadStatus('CSVファイルを選択してください');
    }
  };

  const parseCSV = (csvText: string) => {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        data.push(row);
      }
    }

    return data;
  };

  const mapOldToNewData = (oldData: any) => {
    // Map old table structure to new table structure
    return {
      // Keep the ID if it exists
      ...(oldData.id && { id: oldData.id }),
      
      // Required fields first
      registrationType: oldData.registrationType || '運転開始登録',
      submittedBy: oldData.submittedBy || 'csv-import',
      submittedAt: oldData.submittedAt || new Date().toISOString(),
      approvalStatus: oldData.approvalStatus || 'PENDING',
      teamsNotificationSent: oldData.teamsNotificationSent === 'true' || oldData.teamsNotificationSent === true || false,
      
      // Core fields
      address: oldData.address || '',
      alightingDateTime: oldData.alightingDateTime || '',
      boardingDateTime: oldData.boardingDateTime || '',
      communicationMessage: oldData.communicationMessage || '',
      communicationMessageEnd: oldData.communicationMessageEnd || '',
      destination: oldData.destination || '',
      driverDisplayName: oldData.driverName || '', // Copy driverName to driverDisplayName
      driverExpirationDate: oldData.driverExpirationDate || '',
      driverName: oldData.driverName || '',
      drivingRule1: oldData.drivingRule1 || '',
      drivingRule2: oldData.drivingRule2 || '',
      drivingStatus: oldData.drivingStatus || '運転中',
      imageKey: oldData.imageKey || '',
      imageKeyEnd: oldData.imageKeyEnd || '',
      inspectionResult: oldData.inspectionResult || '',
      inspectionResultEnd: oldData.inspectionResultEnd || '',
      purpose: oldData.purpose || '',
      vehicle: oldData.vehicle || '',
      
      // Boolean fields - handle string to boolean conversion
      focusOnDriving: oldData.focusOnDriving === 'true' || oldData.focusOnDriving === true || false,
      hasLicense: oldData.hasLicense === 'true' || oldData.hasLicense === true || false,
      noAlcohol: oldData.noAlcohol === 'true' || oldData.noAlcohol === true || false,
      vehicleInspection: oldData.vehicleInspection === 'true' || oldData.vehicleInspection === true || false,
      
      // Optional fields
      relatedSubmissionId: oldData.relatedSubmissionId && oldData.relatedSubmissionId !== 'null' ? oldData.relatedSubmissionId : null,
      
      // Legacy approval fields (keep both old and new)
      approvedBy: oldData.approvedBy || '',
      approvedAt: oldData.approvedAt || '',
      
      // New confirmer fields
      confirmedBy: oldData.confirmedBy || oldData.approvedBy || '',
      confirmerEmail: oldData.confirmerEmail || '',
      confirmerId: oldData.confirmerId || '',
      confirmerRole: oldData.confirmerRole || '',
      
      // Optional system fields
      azureObjectId: oldData.azureObjectId || '',
    };
  };

  const handleUpload = async () => {
    if (!file) {
      setUploadStatus('ファイルを選択してください');
      return;
    }

    setIsUploading(true);
    setUploadStatus('CSVファイルを処理中...');
    setProcessedCount(0);
    setErrors([]);

    try {
      // First, test if we can connect to DynamoDB
      console.log('Testing DynamoDB connection...');
      try {
        const testList = await client.models.AlcoholCheckSubmission.list({ limit: 1 });
        console.log('✅ DynamoDB connection successful. Current record count:', testList.data?.length || 0);
        console.log('✅ Table is accessible');
      } catch (connectionError) {
        console.error('❌ DynamoDB connection failed:', connectionError);
        setUploadStatus('❌ データベース接続エラー: ' + (connectionError instanceof Error ? connectionError.message : 'Unknown connection error'));
        setIsUploading(false);
        return;
      }

      const fileText = await file.text();
      console.log('CSV file text (first 500 chars):', fileText.substring(0, 500));
      
      const parsedData = parseCSV(fileText);
      console.log('Parsed CSV data:', parsedData);
      console.log('First row data:', parsedData[0]);
      
      setTotalCount(parsedData.length);
      setUploadStatus(`${parsedData.length}件のレコードを処理中...`);

      const errorList: string[] = [];
      let successCount = 0;

      for (let i = 0; i < parsedData.length; i++) {
        try {
          const mappedData = mapOldToNewData(parsedData[i]);
          
          // Skip empty rows
          if (!mappedData.id) {
            console.log(`Skipping row ${i + 1} - no ID`);
            continue;
          }

          console.log(`Processing record ${i + 1}:`, mappedData);
          console.log(`Final mapped data for record ${i + 1}:`, mappedData);

          const result = await client.models.AlcoholCheckSubmission.create(mappedData);
          console.log(`Create result for record ${i + 1}:`, result);
          
          // Check if the creation was actually successful
          if (result.data && (!result.errors || result.errors.length === 0)) {
            console.log(`✅ Successfully created record ${i + 1}:`, result.data);
            successCount++;
            setProcessedCount(successCount);
          } else {
            // Handle creation failure
            console.error(`❌ Failed to create record ${i + 1}:`, result.errors);
            console.error(`❌ Full error details for record ${i + 1}:`, JSON.stringify(result.errors, null, 2));
            let errorMessage = 'Unknown error';
            if (result.errors && result.errors.length > 0) {
              errorMessage = result.errors.map(err => {
                if (err.message) return err.message;
                if (err.errorType) return `${err.errorType}: ${err.message || 'No message'}`;
                return JSON.stringify(err);
              }).join(', ');
            }
            errorList.push(`レコード ${i + 1} (ID: ${mappedData.id}): ${errorMessage}`);
          }
          
        } catch (error) {
          console.error(`Error processing record ${i + 1}:`, error);
          console.error('Full error details:', JSON.stringify(error, null, 2));
          
          let errorMessage = 'Unknown error';
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (typeof error === 'object' && error !== null) {
            errorMessage = JSON.stringify(error);
          }
          
          errorList.push(`レコード ${i + 1}: ${errorMessage}`);
        }
      }

      setErrors(errorList);
      setUploadStatus(`アップロード完了: ${successCount}件成功, ${errorList.length}件エラー`);

      if (successCount > 0) {
        console.log(`Successfully uploaded ${successCount} records to DynamoDB`);
        
        // Verify records were actually saved
        try {
          const verifyList = await client.models.AlcoholCheckSubmission.list();
          console.log(`✅ Verification: Total records now in DynamoDB: ${verifyList.data?.length || 0}`);
        } catch (verifyError) {
          console.error('❌ Failed to verify records:', verifyError);
        }
      }

    } catch (error) {
      console.error('Upload error:', error);
      console.error('Full upload error details:', JSON.stringify(error, null, 2));
      setUploadStatus('アップロードエラー: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsUploading(false);
    }
  };

  // Test function to verify DynamoDB access
  const testDynamoDBConnection = async () => {
    try {
      console.log('Testing DynamoDB connection...');
      const result = await client.models.AlcoholCheckSubmission.list({ limit: 5 });
      console.log('DynamoDB test result:', result);
      alert(`✅ 接続成功！現在のレコード数: ${result.data?.length || 0}`);
    } catch (error) {
      console.error('DynamoDB test failed:', error);
      alert(`❌ 接続失敗: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">
                🚨 一時的なCSVアップロード機能
              </h1>
              <p className="text-gray-600">
                旧テーブルデータを新しいテーブル構造に移行するための一時的な機能です
              </p>
            </div>
            {onBack && (
              <button
                onClick={onBack}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                戻る
              </button>
            )}
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CSVファイルを選択
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                disabled={isUploading}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
              />
            </div>

            {file && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  選択されたファイル: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(2)} KB)
                </p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={testDynamoDBConnection}
                disabled={isUploading}
                className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                🧪 データベース接続テスト
              </button>

              <button
                onClick={handleUpload}
                disabled={!file || isUploading}
                className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isUploading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    アップロード中... ({processedCount}/{totalCount})
                  </div>
                ) : (
                  'CSVをアップロード'
                )}
              </button>
            </div>

            {uploadStatus && (
              <div className={`p-4 rounded-lg ${
                uploadStatus.includes('エラー') ? 'bg-red-50 text-red-700' : 
                uploadStatus.includes('完了') ? 'bg-green-50 text-green-700' : 
                'bg-blue-50 text-blue-700'
              }`}>
                <p className="font-medium">{uploadStatus}</p>
              </div>
            )}

            {errors.length > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="font-medium text-red-700 mb-2">エラー詳細 ({errors.length}件):</h3>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {errors.slice(0, 10).map((error, index) => (
                    <div key={index} className="text-xs text-red-600 bg-red-100 p-2 rounded font-mono">
                      {error}
                    </div>
                  ))}
                  {errors.length > 10 && (
                    <div className="text-xs text-red-500 italic">
                      ...さらに {errors.length - 10} 件のエラーがあります
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Warning Notice */}
        <div className="mt-8 p-6 bg-yellow-50 border border-yellow-200 rounded-2xl">
          <h3 className="font-bold text-yellow-800 mb-2">⚠️ 重要な注意事項</h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• この機能は一時的なものです</li>
            <li>• データ移行完了後は削除されます</li>
            <li>• 必ずバックアップを取ってから実行してください</li>
            <li>• 重複データがある場合はエラーになります</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TempCSVUpload; 