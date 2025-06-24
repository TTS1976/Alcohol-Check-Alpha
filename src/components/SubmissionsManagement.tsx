import React, { useState, useEffect } from 'react';
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import SearchableSelect from './SearchableSelect';
import { ImageDisplay } from './ImageDisplay';
import { useAuth } from '../contexts/AuthContext';

// Configure client to use API key for public access
const client = generateClient<Schema>({
  authMode: 'apiKey'
});

interface SubmissionsManagementProps {
  onBack?: () => void;
  canApprove?: boolean;
  user?: any;
}

const SubmissionsManagement: React.FC<SubmissionsManagementProps> = ({ 
  onBack, 
  canApprove = true
}) => {
  const { graphService } = useAuth();
  const [submissions, setSubmissions] = useState<Array<Schema["AlcoholCheckSubmission"]["type"]>>([]);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [approvalSupervisors, setApprovalSupervisors] = useState<{[key: string]: string}>({});
  const [status, setStatus] = useState<string | null>(null);
  const [vehicleNames, setVehicleNames] = useState<{[key: string]: string}>({});
  // const [supervisors, setSupervisors] = useState<Array<Schema["Supervisor"]["type"]>>([]);

  // Temporarily bypass admin check for authentication removal
  // const isFullAdmin = true; // user?.signInDetails?.loginId === "tts-driver-admin@teral.co.jp" || user?.username === "tts-driver-admin@teral.co.jp";
  // const isViewerAdmin = true; // user?.signInDetails?.loginId === "tts-driver@teral.co.jp" || user?.username === "tts-driver@teral.co.jp";

  useEffect(() => {
    loadSubmissions();
    // loadSupervisors();
  }, []);

  // Resolve vehicle names when submissions change
  useEffect(() => {
    if (submissions.length > 0 && graphService) {
      resolveVehicleNames();
    }
  }, [submissions, graphService]);

  const loadSubmissions = async () => { 
    try {
      client.models.AlcoholCheckSubmission.observeQuery().subscribe({
        next: (data) => {
          // Filter to only show PENDING submissions
          const pendingSubmissions = data.items.filter(item => 
            item && item.id && item.approvalStatus === 'PENDING'
          );
          setSubmissions(pendingSubmissions);
        },
      });
    } catch (error) {
      console.error('Failed to load submissions:', error);
      setStatus('提出一覧の読み込みに失敗しました');
    }
  };

  const resolveVehicleNames = async () => {
    if (!graphService) return;
    
    try {
      // Get unique vehicle IDs from submissions
      const vehicleIds = [...new Set(
        submissions
          .map(sub => sub.vehicle)
          .filter(id => id && !vehicleNames[id])
      )];

      if (vehicleIds.length === 0) return;

      console.log('Resolving vehicle names for IDs:', vehicleIds);
      const resolved = await graphService.resolveVehicleIds(vehicleIds);
      
      setVehicleNames(prev => ({ ...prev, ...resolved }));
      console.log('Resolved vehicle names:', resolved);
    } catch (error) {
      console.error('Failed to resolve vehicle names:', error);
    }
  };

  // const loadSupervisors = async () => {
  //   try {
  //     const result = await client.models.Supervisor.list({
  //       filter: { 
  //         isDeleted: { eq: false },
  //         isActive: { eq: true }
  //       }
  //     });
  //     setSupervisors(result.data);
  //   } catch (error) {
  //     console.error('Failed to load supervisors:', error);
  //   }
  // };

  const toggleCard = (submissionId: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(submissionId)) {
      newExpanded.delete(submissionId);
    } else {
      newExpanded.add(submissionId);
    }
    setExpandedCards(newExpanded);
  };

  const handleSupervisorChange = (submissionId: string, supervisor: string) => {
    setApprovalSupervisors(prev => ({
      ...prev,
      [submissionId]: supervisor
    }));
  };

  const handleApprove = async (submissionId: string) => {
    const supervisor = approvalSupervisors[submissionId];
    if (!supervisor) {
      setStatus('承認責任者を選択してください');
      return;
    }

    try {
      await client.models.AlcoholCheckSubmission.update({
        id: submissionId,
        approvalStatus: "APPROVED",
        approvedBy: supervisor, // Use selected supervisor instead of current user
        approvedAt: new Date().toISOString(),
      });
      setStatus(`提出が承認されました (承認者: ${supervisor})`);
      
      // Clear the supervisor selection for this submission
      setApprovalSupervisors(prev => {
        const newState = { ...prev };
        delete newState[submissionId];
        return newState;
      });
    } catch (error) {
      console.error("Approval failed:", error);
      setStatus(`承認に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'REJECTED':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('ja-JP');
    } catch {
      return dateString;
    }
  };

  // Temporarily bypass admin access restriction
  // if (!hasAccess) {
  //   return (
  //     <div className="min-h-screen bg-gray-50 flex items-center justify-center">
  //       <div className="bg-white p-8 rounded-lg shadow-md">
  //         <h1 className="text-xl font-bold text-red-600 mb-4">アクセス拒否</h1>
  //         <p>このページにアクセスする権限がありません。</p>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-500 text-white p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">
            提出管理 {canApprove ? '(管理者)' : '(閲覧者)'}
          </h1>
          {onBack && (
            <button 
              onClick={onBack}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm"
            >
              ← 戻る
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* User Role Info */}
        <div className="mb-4 p-3 bg-blue-100 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>アクセスレベル:</strong> 
            {canApprove ? ' 承認権限あり (フル管理者)' : ' 閲覧のみ (承認権限なし)'}
          </p>
        </div>

        {/* Status Messages */}
        {status && (
          <div className={`p-4 rounded-md mb-4 ${
            status.includes('失敗') 
              ? 'bg-red-100 text-red-700 border border-red-300' 
              : 'bg-green-100 text-green-700 border border-green-300'
          }`}>
            {status}
          </div>
        )}

        {/* Submissions Cards */}
        <div className="space-y-4">
          {submissions.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
              承認待ちの申請がありません
            </div>
          ) : (
            submissions
              .sort((a, b) => {
                // Sort by submitted date (newest first)
                return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
              })
              .map((submission) => (
                <div key={submission.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                  {/* Card Header - Always Visible */}
                  <div 
                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleCard(submission.id)}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(submission.approvalStatus || 'PENDING')}`}>
                            {submission.approvalStatus || 'PENDING'}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {submission.driverName || 'Unknown Driver'}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {(submission.vehicle && vehicleNames[submission.vehicle]) || submission.vehicle || 'Unknown Vehicle'} • {formatDate(submission.submittedAt)}
                          </p>
                          {/* Add driving status display */}
                          <div className="mt-2">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              submission.drivingStatus === '運転中' 
                                ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' 
                                : 'bg-green-100 text-green-800 border border-green-300'
                            }`}>
                              {submission.drivingStatus === '運転中' ? '🚗 運転中' : '🏁 運転終了'}
                            </span>
                            <span className="ml-2 text-xs text-gray-500">
                              {submission.registrationType}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <span className="text-sm text-gray-500 mr-2">
                          提出者: {submission.submittedBy || 'Unknown'}
                        </span>
                        <svg 
                          className={`w-5 h-5 text-gray-400 transition-transform ${
                            expandedCards.has(submission.id) ? 'rotate-180' : ''
                          }`}
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Card Body - Expandable */}
                  {expandedCards.has(submission.id) && (
                    <div className="border-t border-gray-200 p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        {/* Vehicle Information */}
                        <div className="space-y-2">
                          <h4 className="font-semibold text-gray-700 border-b pb-1">車両情報</h4>
                          <div><span className="font-medium">運転手:</span> {submission.driverName || 'N/A'}</div>
                          <div><span className="font-medium">車両:</span> {(submission.vehicle && vehicleNames[submission.vehicle]) || submission.vehicle || 'N/A'}</div>
                          <div><span className="font-medium">乗車日時:</span> {submission.boardingDateTime ? formatDate(submission.boardingDateTime) : 'N/A'}</div>
                          <div><span className="font-medium">降車日時:</span> {submission.alightingDateTime ? formatDate(submission.alightingDateTime) : 'N/A'}</div>
                          <div><span className="font-medium">訪問先:</span> {submission.destination || 'N/A'}</div>
                          <div><span className="font-medium">住所:</span> {submission.address || 'N/A'}</div>
                          <div><span className="font-medium">用件:</span> {submission.purpose || 'N/A'}</div>
                        </div>

                        {/* Safety Declaration */}
                        <div className="space-y-2">
                          <h4 className="font-semibold text-gray-700 border-b pb-1">安全運転宣言</h4>
                          <div><span className="font-medium">免許携帯:</span> {submission.hasLicense ? 'はい' : 'いいえ'}</div>
                          <div><span className="font-medium">飲酒なし:</span> {submission.noAlcohol ? 'はい' : 'いいえ'}</div>
                          <div><span className="font-medium">運転集中:</span> {submission.focusOnDriving ? 'はい' : 'いいえ'}</div>
                          <div><span className="font-medium">車両点検:</span> {submission.vehicleInspection ? 'はい' : 'いいえ'}</div>
                          <div><span className="font-medium">遵守事項1:</span> {submission.drivingRule1 || 'N/A'}</div>
                          <div><span className="font-medium">遵守事項2:</span> {submission.drivingRule2 || 'N/A'}</div>
                        </div>

                        {/* Additional Information */}
                        <div className="space-y-2">
                          <h4 className="font-semibold text-gray-700 border-b pb-1">その他</h4>
                          <div><span className="font-medium">検査結果:</span> {submission.inspectionResult ? `${submission.inspectionResult} mg` : 'N/A'}</div>
                          <div><span className="font-medium">伝達事項:</span> {submission.communicationMessage || 'N/A'}</div>
                          <div><span className="font-medium">提出日時:</span> {formatDate(submission.submittedAt)}</div>
                          {submission.approvedBy && (
                            <div><span className="font-medium">承認者:</span> {submission.approvedBy}</div>
                          )}
                          {submission.approvedAt && (
                            <div><span className="font-medium">承認日時:</span> {formatDate(submission.approvedAt)}</div>
                          )}
                        </div>

                        {/* Image Display */}
                        <div className="space-y-2">
                          <h4 className="font-semibold text-gray-700 border-b pb-1">撮影画像</h4>
                          <div className="w-full h-48">
                            <ImageDisplay 
                              fileName={submission.imageKey || ''} 
                            />
                          </div>
                          {submission.imageKey && (
                            <div className="text-xs text-gray-500 mt-1">
                              ファイル名: {submission.imageKey}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Approval Section */}
                      {submission.approvalStatus === "PENDING" && canApprove && (
                        <div className="mt-6 pt-4 border-t border-gray-200">
                          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                            <div className="flex-1">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                承認責任者を選択
                              </label>
                              <SearchableSelect
                                options={[]}
                                value={approvalSupervisors[submission.id] || ''}
                                onChange={(value) => handleSupervisorChange(submission.id, value)}
                                placeholder="承認責任者を選択してください"
                                className="max-w-md"
                              />
                            </div>
                            <button 
                              onClick={() => handleApprove(submission.id)}
                              disabled={!approvalSupervisors[submission.id]}
                              className={`px-6 py-2 rounded text-sm font-medium transition-colors ${
                                approvalSupervisors[submission.id]
                                  ? 'bg-green-500 hover:bg-green-600 text-white'
                                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              }`}
                            >
                              承認
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Show message for viewer users */}
                      {submission.approvalStatus === "PENDING" && !canApprove && (
                        <div className="mt-6 pt-4 border-t border-gray-200">
                          <div className="p-3 bg-yellow-100 rounded-lg">
                            <p className="text-sm text-yellow-800">
                              この申請は承認待ちです。あなたには承認権限がありません。
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SubmissionsManagement; 